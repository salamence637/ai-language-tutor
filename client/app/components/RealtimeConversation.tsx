'use client';

import { useState, useRef, useEffect } from 'react';

interface RealtimeConversationProps {
  onComplete?: () => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

const MODELS = [
  { value: 'gpt-4o-realtime-preview', label: 'GPT-4o Realtime (recommended)' },
  { value: 'gpt-4o-mini-realtime-preview', label: 'GPT-4o Mini Realtime (fast)' },
  { value: 'gpt-realtime', label: 'GPT Realtime' },
  { value: 'gpt-realtime-mini', label: 'GPT Realtime Mini' },
];

const VOICES = [
  { value: 'shimmer', label: 'Shimmer (natural female)' },
  { value: 'nova', label: 'Nova (young female)' },
  { value: 'alloy', label: 'Alloy (neutral)' },
  { value: 'echo', label: 'Echo (deep male)' },
  { value: 'marin', label: 'Marin (gentle female)' },
  { value: 'cedar', label: 'Cedar (warm male)' },
];

export default function RealtimeConversation({ onComplete, theme, setTheme }: RealtimeConversationProps) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'error'>('idle');
  const [error, setError] = useState<string>('');
  const [transcript, setTranscript] = useState<{ user: string; ai: string }>({ user: '', ai: '' });
  const [selectedModel, setSelectedModel] = useState('gpt-4o-realtime-preview');
  const [selectedVoice, setSelectedVoice] = useState('shimmer');
  const [showSettings, setShowSettings] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [tempModel, setTempModel] = useState('gpt-4o-realtime-preview');
  const [tempVoice, setTempVoice] = useState('shimmer');
  const [waitingForAI, setWaitingForAI] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [limitChecked, setLimitChecked] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedModel = localStorage.getItem('realtime_model');
    const savedVoice = localStorage.getItem('realtime_voice');
    if (savedModel) {
      setSelectedModel(savedModel);
      setTempModel(savedModel);
    }
    if (savedVoice) {
      setSelectedVoice(savedVoice);
      setTempVoice(savedVoice);
    }
  }, []);

  useEffect(() => {
    const checkLimitStatus = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/realtime/limit`, {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          if (data.limit_reached) {
            setLimitReached(true);
            setError('Time usage limit exceeded.');
          }
        }
      } catch (err) {
        // Ignore status check errors
      } finally {
        setLimitChecked(true);
      }
    };

    checkLimitStatus();
  }, []);

  // Update temp values when settings are changed
  useEffect(() => {
    if (showSettings) {
      setTempModel(selectedModel);
      setTempVoice(selectedVoice);
      setHasUnsavedChanges(false);
    }
  }, [showSettings]);

  const handleModelChange = (value: string) => {
    setTempModel(value);
    setHasUnsavedChanges(true);
  };

  const handleVoiceChange = (value: string) => {
    setTempVoice(value);
    setHasUnsavedChanges(true);
  };

  const saveSettings = () => {
    setSelectedModel(tempModel);
    setSelectedVoice(tempVoice);
    localStorage.setItem('realtime_model', tempModel);
    localStorage.setItem('realtime_voice', tempVoice);
    setHasUnsavedChanges(false);
    setShowSettings(false);
  };

  const cancelSettings = () => {
    setTempModel(selectedModel);
    setTempVoice(selectedVoice);
    setHasUnsavedChanges(false);
    setShowSettings(false);
  };

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const processorRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Audio queue for sequential playback
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playScheduledRef = useRef(false); // Prevent duplicate play triggers
  const currentResponseIdRef = useRef<string | null>(null); // Track current response ID

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const startConversation = async () => {
    if (!limitChecked || limitReached) {
      return;
    }
    try {
      setStatus('connecting');
      if (!limitReached) {
        setError('');
      }
      setTranscript({ user: '', ai: '' });
      setWaitingForAI(false); // Reset waiting state
      playScheduledRef.current = false; // Reset play schedule flag

      // Clear audio queue and reset state
      audioQueueRef.current = [];
      isPlayingRef.current = false;

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream; // Save stream for cleanup

      // Create audio context for processing
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContext({ sampleRate: 24000 }); // OpenAI expects 24kHz

      // Create media recorder
      mediaRecorderRef.current = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorderRef.current.start(100); // Collect chunks every 100ms

      // Create audio processor for real-time capture
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);

      let audioBuffer: Float32Array[] = [];
      let lastAudioTime = Date.now();

      let audioProcessCount = 0;
      let isSpeaking = false;

      // Send audio chunks periodically to keep connection alive
      const sendInterval = setInterval(() => {
        if (audioBuffer.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          sendAudioChunk(audioBuffer);
          audioBuffer = [];
        }
      }, 500); // Send every 500ms

      // Store interval for cleanup
      (window as any).audioSendInterval = sendInterval;

      processor.onaudioprocess = (e) => {
        audioProcessCount++;
        const inputData = e.inputBuffer.getChannelData(0);
        audioBuffer.push(new Float32Array(inputData));
        lastAudioTime = Date.now();

        // Detect speech activity - with improved noise filtering
        const THRESHOLD = 0.05; // Increased from 0.01 to reduce false triggers
        let samplesAboveThreshold = 0;
        const minSamplesForSpeech = Math.floor(inputData.length * 0.05); // Require 5% of samples above threshold

        for (let i = 0; i < inputData.length; i++) {
          if (Math.abs(inputData[i]) > THRESHOLD) {
            samplesAboveThreshold++;
          }
        }

        const hasAudio = samplesAboveThreshold >= minSamplesForSpeech;

        if (hasAudio) {
          isSpeaking = true;

          // INTERRUPTION: If user starts speaking while AI is playing, stop AI immediately
          if (isPlayingRef.current) {
            // console.log('⚠️ [USER_INTERRUPTION] User started speaking while AI was playing');
            // console.log(`⚠️ [USER_INTERRUPTION] Current response ID: ${currentResponseIdRef.current || 'none'}`);
            // console.log(`⚠️ [USER_INTERRUPTION] Stopping AI audio playback`);

            // Stop current audio source
            if (currentAudioSourceRef.current) {
              try {
                currentAudioSourceRef.current.stop();
                currentAudioSourceRef.current = null;
                // console.log('⚠️ [USER_INTERRUPTION] Audio source stopped successfully');
              } catch (e) {
                // console.log('⚠️ [USER_INTERRUPTION] Audio source already stopped');
              }
            }
            // Reset playing state and clear queue
            isPlayingRef.current = false;
            audioQueueRef.current = [];
            playScheduledRef.current = false;
            setStatus('connected');
          }

          // Show Done Speaking button again when user restarts speaking
          if (waitingForAI) {
            // console.log('⚠️ [USER_INTERRUPTION] User resumed speaking, showing Done Speaking button');
            setWaitingForAI(false);
          }

          // Clear silence timeout if user is speaking
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }
        } else if (isSpeaking) {
          // User was speaking but now silent
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }
          silenceTimeoutRef.current = setTimeout(() => {
            // User stopped speaking - commit and request response
            // console.log('[AUTO_DONE] User stopped speaking (800ms silence) - sending stop_speaking');
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: 'stop_speaking'
              }));
              // console.log('[AUTO_DONE] Sent stop_speaking signal to backend');
            }
            setWaitingForAI(true); // Hide Done Speaking button
            isSpeaking = false;
          }, 800); // 800ms silence = done speaking
        }
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      processorRef.current = processor;

      // Connect to backend to create session
      const response = await fetch(`${API_BASE_URL}/api/realtime/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sdp: 'placeholder',  // We don't need actual SDP for WebSocket-based implementation
          model: selectedModel,
          voice: selectedVoice
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create Realtime session');
      }

      const data = await response.json();

      if (data.error) {
        if (data.error === 'Time usage limit exceeded.') {
          setLimitReached(true);
        }
        throw new Error(data.error);
      }

      // Connect WebSocket for audio streaming
      const wsUrl = `${API_BASE_URL.replace('http', 'ws')}/api/realtime/ws/${data.session_id}`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        // console.log('[WS] Connected');
        setStatus('connected');
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (err) {
          // console.error('[WS] Message error:', err);
        }
      };

      wsRef.current.onerror = (error) => {
        // console.error('[WS] Connection error');
        setStatus('error');
        setError('WebSocket connection failed');
      };

      wsRef.current.onclose = (event) => {
        // console.warn(`[WS] Closed - Code: ${event.code}`);
        if (status !== 'error') {
          setStatus('idle');
        }
      };

    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to start conversation');
    }
  };

  const sendAudioChunk = async (audioBuffer: Float32Array[]) => {
    try {
      // Convert Float32Array to PCM16
      let totalLength = 0;
      for (const chunk of audioBuffer) {
        totalLength += chunk.length;
      }

      const pcmData = new Int16Array(totalLength);
      let offset = 0;

      for (const chunk of audioBuffer) {
        for (let i = 0; i < chunk.length; i++) {
          const s = Math.max(-1, Math.min(1, chunk[i]));
          pcmData[offset++] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
      }

      // Convert to base64 using loop instead of spread operator
      const bytes = new Uint8Array(pcmData.buffer);
      let binary = '';
      const chunkSize = 0x8000; // 32KB chunks
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      const audioBase64 = btoa(binary);

      // Send via WebSocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'audio',
          audio: audioBase64
        }));
      }
    } catch (err) {
      // Error sending audio - silently retry
    }
  };

  const stopCurrentPlayback = () => {
    // Stop current audio playback if any
    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.stop();
        currentAudioSourceRef.current = null;
      } catch (e) {
        // Already stopped
      }
    }
    // Reset playing state
    isPlayingRef.current = false;
    // Clear audio queue
    audioQueueRef.current = [];
  };

  const manualDoneSpeaking = () => {
    // User manually indicates they're done speaking
    // console.log('[MANUAL_DONE] User clicked Done Speaking button');

    // Clear silence timeout
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    // Send stop_speaking signal immediately
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'stop_speaking'
      }));
      // console.log('[MANUAL_DONE] Sent stop_speaking signal to backend');
    }

    setWaitingForAI(true); // Hide Done Speaking button
    setStatus('listening');
  };

  const stopConversation = async () => {
    // Clear audio send interval
    if ((window as any).audioSendInterval) {
      clearInterval((window as any).audioSendInterval);
      delete (window as any).audioSendInterval;
    }

    // Clear silence timeout
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Stop all media tracks to release microphone
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Disconnect audio processor
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setStatus('idle');
    setWaitingForAI(false);
  };

  const handleWebSocketMessage = (data: any) => {
    const appendWithSpacing = (prev: string, delta: string) => {
      if (!prev) {
        return delta;
      }
      if (!delta) {
        return prev;
      }
      const prevEndsWithSpace = /\s$/.test(prev);
      const deltaStartsWithSpace = /^\s/.test(delta);
      const needsSpace =
        !prevEndsWithSpace &&
        !deltaStartsWithSpace &&
        /[A-Za-z0-9\)\]"'!.?]$/.test(prev) &&
        /^[A-Za-z0-9"']/.test(delta);
      return needsSpace ? `${prev} ${delta}` : `${prev}${delta}`;
    };

    if (data.type === 'status') {
      if (data.status === 'connected') {
        setStatus('connected');
      } else if (data.status === 'listening') {
        setStatus('listening');
      }
    } else if (data.type === 'audio') {
      // Streaming audio: play immediately as chunks arrive
      const audioSize = data.audio ? data.audio.length : 0;
      // console.log(`[AUDIO_CHUNK] Received audio chunk, size: ${audioSize} chars, queue: ${audioQueueRef.current.length} chunks`);
      queueAudio(data.audio);

      // Start playing after first chunk arrives (with small buffer)
      // This enables streaming playback instead of waiting for all chunks
      if (!playScheduledRef.current && !isPlayingRef.current && audioQueueRef.current.length > 0) {
        // Clear any existing play timeout
        if ((window as any).playTimeout) {
          clearTimeout((window as any).playTimeout);
        }
        // Wait briefly to accumulate a few chunks for smooth playback
        (window as any).playTimeout = setTimeout(() => {
          if (audioQueueRef.current.length > 0 && !isPlayingRef.current) {
            // console.log(`[PLAYBACK] Starting playback after 100ms buffer. Queue: ${audioQueueRef.current.length} chunks, Response ID: ${currentResponseIdRef.current || 'none'}`);
            playScheduledRef.current = true; // Mark as scheduled
            processAudioQueue();
          }
        }, 100); // 100ms buffer to reduce latency
      }
    } else if (data.type === 'user_transcript') {
      setTranscript(prev => ({ ...prev, user: appendWithSpacing(prev.user, data.text) }));
    } else if (data.type === 'ai_transcript') {
      setTranscript(prev => ({ ...prev, ai: appendWithSpacing(prev.ai, data.text) }));
    } else if (data.type === 'response_started') {
      const newResponseId = data.response_id;
      // console.log(`[RESPONSE_STARTED] Response ID: ${newResponseId}`);
      setWaitingForAI(false);

      // Check if this is a new response (user interrupted)
      if (currentResponseIdRef.current && currentResponseIdRef.current !== newResponseId) {
        // console.log(`⚠️ [INTERRUPTION] New response detected. Old: ${currentResponseIdRef.current}, New: ${newResponseId}`);
        // console.log(`⚠️ [INTERRUPTION] Reason: User started speaking before previous response finished`);

        // Force stop any playing audio
        if (isPlayingRef.current) {
          // console.log(`⚠️ [INTERRUPTION] Stopping current audio playback`);
          stopCurrentPlayback();
        }

        // Clear queue to prevent mixed audio
        if (audioQueueRef.current.length > 0) {
          // console.log(`⚠️ [INTERRUPTION] Clearing ${audioQueueRef.current.length} audio chunks from old response`);
          audioQueueRef.current = [];
        }

        playScheduledRef.current = false;
      }

      currentResponseIdRef.current = newResponseId;
    } else if (data.type === 'response_done') {
      // Play any remaining audio in the queue (only if not already scheduled/playing)
      setTimeout(() => {
        if (audioQueueRef.current.length > 0 && !isPlayingRef.current && !playScheduledRef.current) {
          playScheduledRef.current = true;
          processAudioQueue();
        }
      }, 300); // 300ms to catch any straggling chunks
    } else if (data.type === 'error') {
      if (data.code === 'LIMIT_REACHED') {
        setError('Time usage limit exceeded.');
        setLimitReached(true);
        stopConversation();
      } else if (data.message) {
        setError(data.message);
      }
    }
  };

  const queueAudio = (audioBase64: string) => {
    try {
      // Decode base64 to get PCM16 data
      const binaryString = atob(audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Keep as PCM16 Int16Array
      const pcm16 = new Int16Array(bytes.buffer);
      audioQueueRef.current.push(pcm16);
    } catch (err) {
      // console.error('[AUDIO_ERROR] Queue failed:', err);
    }
  };

  const processAudioQueue = async () => {
    if (audioQueueRef.current.length === 0 || isPlayingRef.current) {
      if (audioQueueRef.current.length > 0) {
        // console.warn(`[PLAYBACK] Skipping - already playing. Queue: ${audioQueueRef.current.length} chunks`);
      }
      return;
    }

    // console.log(`[PLAYBACK] Processing ${audioQueueRef.current.length} audio chunks. Response ID: ${currentResponseIdRef.current || 'none'}`);
    setStatus('speaking');

    // Merge all audio chunks into one continuous stream
    let totalLength = 0;
    for (const chunk of audioQueueRef.current) {
      totalLength += chunk.length;
    }

    // Create merged PCM16 array
    const mergedPcm16 = new Int16Array(totalLength);
    let offset = 0;
    for (const chunk of audioQueueRef.current) {
      mergedPcm16.set(chunk, offset);
      offset += chunk.length;
    }

    // Clear queue
    audioQueueRef.current = [];

    // Convert to Float32Array for playback
    const float32 = new Float32Array(mergedPcm16.length);
    for (let i = 0; i < mergedPcm16.length; i++) {
      float32[i] = mergedPcm16[i] / 32768.0;
    }

    // Play using AudioContext
    if (!audioContextRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }

    // Ensure AudioContext is running
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
    audioBuffer.copyToChannel(float32, 0);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);

    // Store current audio source for interruption
    currentAudioSourceRef.current = source;

    // Set a timeout to reset isPlayingRef in case onended doesn't fire
    const playbackTimeout = setTimeout(() => {
      if (isPlayingRef.current) {
        // console.warn('[PLAYBACK_TIMEOUT] Resetting after 10s');
        isPlayingRef.current = false;
        setWaitingForAI(false); // Show Done Speaking button again
        setStatus('connected');
        playScheduledRef.current = false; // Reset flag

        // Check if there's more audio in the queue
        if (audioQueueRef.current.length > 0) {
          processAudioQueue();
        }
      }
    }, 10000); // 10 second timeout

    source.onended = () => {
      clearTimeout(playbackTimeout);
      // console.log(`[PLAYBACK] Audio finished. Response ID: ${currentResponseIdRef.current || 'none'}`);
      isPlayingRef.current = false;
      setWaitingForAI(false); // Show Done Speaking button again
      setStatus('connected');

      // Reset play scheduled flag when playback finishes
      playScheduledRef.current = false;

      // Check if there's more audio in the queue
      if (audioQueueRef.current.length > 0) {
        // console.log(`[PLAYBACK] ${audioQueueRef.current.length} more chunks in queue - continuing`);
        processAudioQueue();
      }
    };

    source.onerror = (error) => {
      clearTimeout(playbackTimeout);
      // console.error(`[PLAYBACK_ERROR] Audio playback error. Response ID: ${currentResponseIdRef.current || 'none'}`, error);
      isPlayingRef.current = false;
      setWaitingForAI(false); // Show Done Speaking button again even on error
      setStatus('connected');
      playScheduledRef.current = false; // Reset on error
    };

    isPlayingRef.current = true;
    source.start();
    // console.log(`[PLAYBACK] Audio started. Total samples: ${float32.length}, Duration: ${(float32.length / 24000).toFixed(2)}s`);
  };


  return (
    <div className={`${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'} rounded-2xl shadow-lg p-8`}>
      <div className="text-center mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold">Realtime Voice Conversation</h2>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-medium"
            title="Settings"
          >
            ⚙️ Settings
          </button>
        </div>
        <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Talk naturally with AI - no need to press any buttons</p>
        <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>💡 Speak in English and stop talking to hear AI response</p>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className={`mb-6 p-4 rounded-lg border shadow-inner ${
          theme === 'dark'
            ? 'bg-gray-800 border-gray-700'
            : 'bg-slate-100 border-slate-300'
        }`}>
          <h3 className={`font-semibold mb-3 flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            <span>⚙️</span> Settings
          </h3>

          {/* Model Selection */}
          <div className="mb-4">
            <label className={`block text-sm font-semibold mb-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
              Model
            </label>
            <select
              value={tempModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                theme === 'dark'
                  ? 'bg-gray-700 border-gray-600 text-white focus:ring-blue-600'
                  : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500'
              }`}
              disabled={status !== 'idle' && status !== 'error'}
            >
              {MODELS.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
          </div>

          {/* Voice Selection */}
          <div className="mb-4">
            <label className={`block text-sm font-semibold mb-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
              Voice
            </label>
            <select
              value={tempVoice}
              onChange={(e) => handleVoiceChange(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                theme === 'dark'
                  ? 'bg-gray-700 border-gray-600 text-white focus:ring-blue-600'
                  : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500'
              }`}
              disabled={status !== 'idle' && status !== 'error'}
            >
              {VOICES.map((voice) => (
                <option key={voice.value} value={voice.value}>
                  {voice.label}
                </option>
              ))}
            </select>
          </div>

          {/* Save/Cancel Buttons */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={saveSettings}
              disabled={!hasUnsavedChanges}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                hasUnsavedChanges
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-400 text-gray-600 cursor-not-allowed'
              }`}
            >
              Save
            </button>
            <button
              onClick={cancelSettings}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                theme === 'dark'
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Cancel
            </button>
          </div>

          <p className={`text-xs mt-3 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
            💡 Changes take effect on next conversation
          </p>
        </div>
      )}

      {/* Status */}
      <div className={`mb-6 p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
        <div className="flex items-center justify-center gap-2">
          <div className={`w-3 h-3 rounded-full ${
            status === 'idle' ? 'bg-gray-400' :
            status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            status === 'connected' ? 'bg-blue-500' :
            status === 'listening' ? 'bg-green-500 animate-pulse' :
            status === 'speaking' ? 'bg-purple-500' :
            status === 'error' ? 'bg-red-500' :
            'bg-gray-400'
          }`}></div>
          <span className={`font-medium capitalize ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
            {status === 'idle' && 'Ready to start'}
            {status === 'connecting' && 'Connecting to OpenAI...'}
            {status === 'connected' && 'Connected - Start speaking'}
            {status === 'listening' && 'Listening...'}
            {status === 'speaking' && 'AI is responding...'}
            {status === 'error' && 'Error occurred'}
          </span>
        </div>
        {/* Current Configuration */}
        {status === 'idle' && !showSettings && (
          <div className={`mt-2 text-xs text-center ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
            <span className="font-medium">Model:</span> {MODELS.find(m => m.value === selectedModel)?.label} |
            <span className="font-medium ml-2">Voice:</span> {VOICES.find(v => v.value === selectedVoice)?.label}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 font-medium mb-2">Error:</p>
          <p className="text-red-600 text-sm">{error}</p>
          <p className="text-red-500 text-xs mt-2">Make sure your OPENAI_API_KEY is configured correctly in service/.env</p>
        </div>
      )}

      {/* Transcript */}
      {(transcript.user || transcript.ai) && (
        <div className="mb-6 space-y-3">
          {transcript.user && (
            <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-blue-900/30 border border-blue-700' : 'bg-blue-50'}`}>
              <p className={`text-sm font-medium mb-1 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-600'}`}>You:</p>
              <p className={theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}>{transcript.user}</p>
            </div>
          )}
          {transcript.ai && (
            <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-green-900/30 border border-green-700' : 'bg-green-50'}`}>
              <p className={`text-sm font-medium mb-1 ${theme === 'dark' ? 'text-green-300' : 'text-green-600'}`}>AI Tutor:</p>
              <p className={theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}>{transcript.ai}</p>
            </div>
          )}
        </div>
      )}


      {/* Controls */}
      <div className="flex justify-center gap-4">
        {status === 'idle' || status === 'error' ? (
          <button
            onClick={startConversation}
            className={`px-8 py-3 rounded-lg font-medium shadow-lg transition-colors ${
              limitReached || !limitChecked
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
            disabled={limitReached || !limitChecked}
          >
            Start Conversation
          </button>
        ) : (
          <>
            {/* Done Speaking button (pause icon) - shown when connected/listening and waiting for user */}
            {(status === 'connected' || status === 'listening') && !waitingForAI && (
              <button
                onClick={manualDoneSpeaking}
                className="w-14 h-14 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg flex items-center justify-center text-3xl"
                title="Done speaking - trigger AI response"
              >
                ■
              </button>
            )}
            <button
              onClick={stopConversation}
              className="px-8 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium shadow-lg"
            >
              Stop Conversation
            </button>
          </>
        )}
      </div>

      {/* Back to Classic Mode */}
      <div className="mt-6 text-center">
        <button
          onClick={onComplete}
          className={`text-sm underline ${theme === 'dark' ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Switch to Classic Mode (Record & Send)
        </button>
      </div>
    </div>
  );
}
