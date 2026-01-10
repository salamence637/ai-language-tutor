# SPEC — AI Tutor Web App (STT + LLM + TTS) MVP

## 0. Scope

This SPEC defines the MVP behavior for an AI English tutor web app using:

- Speech-to-Text (STT)
- Text LLM for tutoring logic
- Text-to-Speech (TTS)

Non-goals (MVP):

- No accounts / payments
- No realtime streaming
- No pronunciation scoring
- No long-term user analytics dashboards

## 1. User Experience

### 1.1 Main Screen Components

- Record button (Start / Stop)
- Status indicator: idle / recording / uploading / generating / playing
- Transcript area:
  - "You said:" user transcript
  - "Tutor:" assistant reply text
- Feedback cards (max 2):
  - Mistake type, original, suggestion, short explanation
- Follow-up question area
- Play button (optional if autoplay works)

### 1.2 Talk Cycle (One Turn)

1. User clicks Start, speaks (max 30 seconds), clicks Stop
2. Client uploads audio to backend
3. Backend:
   - STT -> user_transcript
   - LLM -> assistant_reply_text + structured feedback
   - TTS -> assistant audio
4. Client:
   - displays transcript + feedback + follow-up question
   - plays assistant audio

## 2. Limits & Error Handling

- Max audio length: 30 seconds (server enforces)
- If STT fails: return error code STT_FAILED
- If LLM fails: return error code LLM_FAILED
- If TTS fails: return error code TTS_FAILED
- Client must show a human-readable message and allow retry

## 3. API Contract (Backend)

Base URL: /api

### 3.1 POST /api/talk

Request: multipart/form-data

- audio: File (webm/wav/mp3)
- session_id: string (optional; if missing, server creates one)

Response (200):

```json
{
  "session_id": "string",
  "user_transcript": "string",
  "assistant_reply_text": "string",
  "feedback": {
    "corrections": [
      {
        "type": "grammar|wording|fluency",
        "original": "string",
        "suggestion": "string",
        "explanation": "string"
      }
    ],
    "better_phrases": [{ "original": "string", "suggestion": "string" }],
    "follow_up_question": "string"
  },
  "assistant_audio": {
    "format": "mp3",
    "data_base64": "string"
  }
}
```

Response (4xx/5xx):

{
"error": {
"code": "BAD_AUDIO|TOO_LONG|STT_FAILED|LLM_FAILED|TTS_FAILED|SERVER_ERROR",
"message": "string"
}
}

4. Tutor Policy (LLM Behavior)
   4.1 Output Rules

Always be encouraging.

Provide at most 2 corrections. Only the most important issues.

Always include exactly 1 follow-up question.

feedback must be STRICT JSON (no markdown, no extra text).

4.2 Suggested Prompt Contract (internal)

Backend should use a stable system prompt that enforces:

JSON-only output for feedback

max 2 corrections

concise explanations

5. Persistence (MVP)

Store minimal conversation logs in SQLite:

session_id, timestamps

user_transcript, assistant_reply_text

feedback JSON

Storing raw audio is OPTIONAL and disabled by default.

6. Acceptance Criteria

Milestone 1 (backend only):

Calling POST /api/talk with a valid audio file returns:

non-empty user_transcript

valid feedback JSON (max 2 corrections)

playable mp3 audio (base64)

Includes pytest tests:

empty audio -> BAD_AUDIO

too long audio -> TOO_LONG

normal short audio -> success

Milestone 2 (frontend + backend):

Browser can record and send audio

UI shows transcript + feedback + follow-up question

Plays assistant audio successfully

Notes:

- STT uses OpenAI Audio transcription endpoints and supported models. :contentReference[oaicite:4]{index=4}
- TTS uses OpenAI Audio speech endpoint (gpt-4o-mini-tts or equivalent). :contentReference[oaicite:5]{index=5}
