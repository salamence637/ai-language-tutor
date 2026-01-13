// API client for backend communication

import { getClientId } from './clientId';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function uploadAudio(
  audioBlob: Blob,
  sessionId?: string
): Promise<Response> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'audio.webm');
  if (sessionId) {
    formData.append('session_id', sessionId);
  }

  const response = await fetch(`${API_BASE_URL}/api/talk`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers: {
      'X-Client-Id': getClientId() || '',
    },
  });

  return response;
}

export function getErrorMessage(errorCode: string): string {
  const errorMessages: Record<string, string> = {
    BAD_AUDIO: 'Audio file is empty or invalid. Please try recording again.',
    TOO_LONG: 'Audio is too long. Please keep it under 30 seconds.',
    STT_FAILED: 'Failed to transcribe audio. Please try again.',
    LLM_FAILED: 'Failed to generate feedback. Please try again.',
    TTS_FAILED: 'Failed to generate voice response. Please try again.',
    SERVER_ERROR: 'Server error. Please try again.',
  };

  return errorMessages[errorCode] || 'An unexpected error occurred.';
}
