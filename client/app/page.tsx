'use client';

import { useState, useRef, useEffect } from 'react';
import AudioRecorder from './components/AudioRecorder';
import CorrectionCard from './components/CorrectionCard';
import RealtimeConversation from './components/RealtimeConversation';
import { TalkResponse, TalkStatus, ErrorResponse } from './types';
import { uploadAudio, getErrorMessage } from './lib/api';

type Mode = 'classic' | 'realtime';

export default function Home() {
  const [mode, setMode] = useState<Mode>('classic');
  const [status, setStatus] = useState<TalkStatus>('idle');
  const [sessionId, setSessionId] = useState<string>('');
  const [response, setResponse] = useState<TalkResponse | null>(null);
  const [error, setError] = useState<string>('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load theme preference on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      setTheme(savedTheme as 'light' | 'dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    }
  }, []);

  // Apply theme to document and save to localStorage
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleRecordingComplete = async (audioBlob: Blob) => {
    setStatus('uploading');
    setError('');
    setResponse(null);

    try {
      const res = await uploadAudio(audioBlob, sessionId || undefined);

      if (!res.ok) {
        const errorData: ErrorResponse = await res.json();
        const errorCode = errorData.detail.error.code;
        const errorMessage = errorData.detail.error.message;
        setStatus('error');
        setError(`${errorCode}: ${errorMessage || getErrorMessage(errorCode)}`);
        return;
      }

      setStatus('generating');
      const data: TalkResponse = await res.json();

      setStatus('success');
      setResponse(data);
      setSessionId(data.session_id);

      // Auto-play audio
      if (data.assistant_audio?.data_base64) {
        playAudio(data.assistant_audio.data_base64);
      }
    } catch (err) {
      setStatus('error');
      setError('Network error. Please check if the backend server is running.');
      // console.error('Error uploading audio:', err);
    }
  };

  const playAudio = (base64Audio: string) => {
    try {
      const audioBytes = atob(base64Audio);
      const audioArray = new Uint8Array(audioBytes.length);
      for (let i = 0; i < audioBytes.length; i++) {
        audioArray[i] = audioBytes.charCodeAt(i);
      }

      const audioBlob = new Blob([audioArray], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(audioBlob);

      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.play();
        setStatus('playing');

        audioRef.current.onended = () => {
          setStatus('success');
          URL.revokeObjectURL(audioUrl);
        };
      }
    } catch (err) {
      // console.error('Error playing audio:', err);
    }
  };

  const handlePlayAudio = () => {
    if (response?.assistant_audio?.data_base64) {
      playAudio(response.assistant_audio.data_base64);
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setError('');
    setResponse(null);
  };

  const isProcessing = status === 'uploading' || status === 'generating';

  return (
    <div className={`min-h-screen ${
      theme === 'dark'
        ? 'bg-gradient-to-br from-gray-900 to-gray-800'
        : 'bg-gradient-to-br from-blue-50 to-indigo-100'
    }`}>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="flex items-center justify-between mb-4">
            <div></div>
            <h1 className={`text-4xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
              AI English Tutor
            </h1>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
          <p className={theme === 'dark' ? 'text-gray-300 mb-4' : 'text-gray-600 mb-4'}>
            Practice speaking and get instant feedback
          </p>

          {/* Mode Switcher */}
          <div className="flex justify-center items-center gap-4">
            <button
              onClick={() => setMode('classic')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                mode === 'classic'
                  ? 'bg-blue-600 text-white'
                  : theme === 'dark'
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Classic Mode
            </button>
            <button
              onClick={() => setMode('realtime')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                mode === 'realtime'
                  ? 'bg-green-600 text-white'
                  : theme === 'dark'
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Realtime Mode (Beta)
            </button>
          </div>
        </header>

        {/* Status Indicator */}
        {status !== 'idle' && (
          <div className="mb-8 p-4 rounded-lg bg-white shadow-sm">
            <div className="flex items-center justify-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                status === 'recording' ? 'bg-red-500 animate-pulse' :
                status === 'uploading' || status === 'generating' ? 'bg-yellow-500 animate-spin' :
                status === 'playing' ? 'bg-green-500' :
                status === 'error' ? 'bg-red-600' :
                'bg-green-600'
              }`}></div>
              <span className="font-medium text-gray-700 capitalize">
                {status === 'idle' && 'Ready'}
                {status === 'recording' && 'Recording...'}
                {status === 'uploading' && 'Uploading audio...'}
                {status === 'generating' && 'Generating feedback...'}
                {status === 'playing' && 'Playing response...'}
                {status === 'success' && 'Complete!'}
                {status === 'error' && 'Error occurred'}
              </span>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="space-y-8">
          {/* Realtime Mode */}
          {mode === 'realtime' && (
            <RealtimeConversation theme={theme} setTheme={setTheme} />
          )}

          {/* Classic Mode */}
          {mode === 'classic' && (
            <>
              {/* Recorder Section */}
              {!response && !error && (
                <div className="bg-white rounded-2xl shadow-lg p-8">
                  <AudioRecorder
                    onRecordingComplete={handleRecordingComplete}
                    isDisabled={isProcessing}
                  />
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="text-red-500 text-2xl">⚠️</div>
                    <div className="flex-1">
                      <h3 className="font-bold text-red-800 mb-2">Something went wrong</h3>
                      <p className="text-red-700 mb-4">{error}</p>
                      <button
                        onClick={handleReset}
                        className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        Try Again
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Response Display */}
              {response && (
                <div className="space-y-6">
                  {/* User Transcript */}
                  <div className="bg-white rounded-2xl shadow-lg p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm">You</span>
                      </div>
                      <h3 className="font-semibold text-gray-800">You said:</h3>
                    </div>
                    <p className="text-gray-700 text-lg ml-10">{response.user_transcript}</p>
                  </div>

                  {/* Tutor Response */}
                  <div className="bg-white rounded-2xl shadow-lg p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm">AI</span>
                      </div>
                      <h3 className="font-semibold text-gray-800">Tutor:</h3>
                    </div>
                    <p className="text-gray-700 text-lg ml-10">{response.assistant_reply_text}</p>

                    {/* Play Audio Button */}
                    <div className="mt-4 ml-10">
                      <button
                        onClick={handlePlayAudio}
                        disabled={status === 'playing'}
                        className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors disabled:opacity-50"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                        </svg>
                        {status === 'playing' ? 'Playing...' : 'Play Voice'}
                      </button>
                    </div>

                    {/* Hidden Audio Element */}
                    <audio ref={audioRef} className="hidden" />
                  </div>

                  {/* Corrections */}
                  {response.feedback.corrections.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-lg p-6">
                      <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <span className="text-2xl">💡</span>
                        Feedback ({response.feedback.corrections.length})
                      </h3>
                      <div className="space-y-4">
                        {response.feedback.corrections.map((correction, index) => (
                          <CorrectionCard key={index} correction={correction} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Follow-up Question */}
                  <div className="bg-white rounded-2xl shadow-lg p-6">
                    <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <span className="text-2xl">❓</span>
                      Follow-up Question
                    </h3>
                    <p className="text-gray-700 text-lg">{response.feedback.follow_up_question}</p>
                  </div>

                  {/* Continue Button */}
                  <div className="flex justify-center">
                    <button
                      onClick={handleReset}
                      className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg"
                    >
                      Continue Practice
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {/* Footer */}
        <footer className="mt-16 text-center text-gray-500 text-sm">
          <p>Powered by OpenAI • Max recording time: 30 seconds</p>
        </footer>
      </div>
    </div>
  );
}
