# CLAUDE.md — Working Contract for Claude Code

Project: AI Tutor Web App (STT + LLM + TTS)

## Repository Structure (fixed)

- /client : Next.js (TypeScript) web app
- /service : FastAPI (Python) backend
- /docs : specs and task plan

Do not rename these folders.

## Objective (MVP)

A user records speech in the browser and receives:

1. user transcript (STT)
2. tutor feedback (max 2 corrections)
3. one follow-up question
4. tutor voice reply (TTS audio)

## Fixed Tech Stack

- Client: Next.js + TypeScript
- Service: FastAPI + Python
- Storage: SQLite for MVP (file-based)
- No Realtime API in MVP. Use STT -> LLM -> TTS pipeline.

## Security Rules (MANDATORY)

- NEVER put API keys in /client or any client-side code. Keys must stay in /service only. :contentReference[oaicite:1]{index=1}
- Load secrets from environment variables (e.g., OPENAI_API_KEY).
- Provide /service/.env.example, but never commit real secrets.
- Add .env\* to .gitignore.

## Milestone Workflow (MANDATORY)

Work strictly milestone by milestone.

- Only implement the current milestone scope.
- Do not start the next milestone until the current one passes self-check.

## Self-check After Each Milestone (MANDATORY)

1. Run unit tests (pytest) in /service and fix failures.
2. Run TypeScript checks/lint in /client if configured.
3. Manual smoke test steps must be written in README and executed:
   - Start backend (and frontend when applicable)
   - Perform one full talk cycle
   - Confirm transcript, feedback JSON, and playable TTS audio

## Decision Rules (reduce questions)

- If something is unspecified, choose the simplest working option and document it in docs/SPEC.md + README.
- Ask questions ONLY if it blocks progress or risks destructive changes.

## Deliverables (always update)

- README: exact setup commands + env vars + smoke test steps
- docs/SPEC.md: keep consistent with the implemented behavior
- docs/TASKS.md: check off tasks and keep status clear

## OpenAI Usage Constraints

- STT must use OpenAI Audio transcription endpoints (models like gpt-4o-mini-transcribe / gpt-4o-transcribe). :contentReference[oaicite:2]{index=2}
- TTS must use OpenAI Audio speech endpoint (model gpt-4o-mini-tts or equivalent). :contentReference[oaicite:3]{index=3}
- LLM should return STRICT JSON for feedback (no markdown).
