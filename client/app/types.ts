// Type definitions for AI Tutor API

export type CorrectionType = 'grammar' | 'wording' | 'fluency';

export interface Correction {
  type: CorrectionType;
  original: string;
  suggestion: string;
  explanation: string;
}

export interface Feedback {
  corrections: Correction[];
  better_phrases: Array<{ original: string; suggestion: string }>;
  follow_up_question: string;
}

export interface AssistantAudio {
  format: string;
  data_base64: string;
}

export interface TalkResponse {
  session_id: string;
  user_transcript: string;
  assistant_reply_text: string;
  feedback: Feedback;
  assistant_audio: AssistantAudio;
}

export interface ErrorResponse {
  detail: {
    error: {
      code: 'BAD_AUDIO' | 'TOO_LONG' | 'STT_FAILED' | 'LLM_FAILED' | 'TTS_FAILED' | 'SERVER_ERROR';
      message: string;
    };
  };
}

export type TalkStatus = 'idle' | 'recording' | 'uploading' | 'generating' | 'playing' | 'error' | 'success';
