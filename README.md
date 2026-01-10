# AI Tutor Web App (STT + LLM + TTS)

An AI-powered English tutor web application. Users speak in the browser and receive real-time feedback with corrections, suggestions, and voice responses.

## Project Structure

```
aitutor/
├── client/          # Next.js (TypeScript) web app
├── service/         # FastAPI (Python) backend
├── docs/            # Specifications and task plans
└── README.md        # This file
```

## Tech Stack

- **Client**: Next.js + TypeScript
- **Service**: FastAPI + Python
- **Storage**: SQLite (file-based)
- **AI Services**: OpenAI (STT, LLM, TTS)

## Environment Variables

Only the backend (`/service`) requires environment variables.

### Setup

1. Copy the example file:
   ```bash
   cp service/.env.example service/.env
   ```

2. Edit `service/.env` and add your OpenAI API key:
   ```bash
   OPENAI_API_KEY=sk-your-actual-key-here
   ```

### Required Variables

| Variable | Description | Where |
|----------|-------------|-------|
| `OPENAI_API_KEY` | OpenAI API key for STT, LLM, and TTS | `service/.env` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `./aitutor.db` | SQLite database file path |
| `MAX_AUDIO_LENGTH_SECONDS` | `30` | Maximum audio upload length |

## Milestone 1: Backend Installation & Testing

### 1. Install Dependencies

```bash
cd service
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cd service
cp .env.example .env
# Edit .env and add your OpenAI API key
```

### 3. Run Unit Tests

```bash
cd service
pytest -v
```

Expected output: All 6 tests pass
- `test_empty_audio_returns_bad_audio` - Verifies empty audio returns BAD_AUDIO error
- `test_too_long_audio_returns_too_long` - Verifies audio >30s returns TOO_LONG error
- `test_normal_audio_returns_success` - Verifies normal audio returns valid response
- `test_stt_failure_returns_stt_failed` - Verifies STT failure handling
- `test_llm_failure_returns_llm_failed` - Verifies LLM failure handling
- `test_tts_failure_returns_tts_failed` - Verifies TTS failure handling

### 4. Start Backend Server

```bash
cd service
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Server will start at `http://localhost:8000`

### 5. Manual Testing with curl

#### Health Check
```bash
curl http://localhost:8000/
```
Expected: `{"status":"ok","message":"AI Tutor API is running"}`

#### Test with Real Audio (Short Audio File)

First, create a short audio file (e.g., `test_audio.mp3`) or use any short speech recording (<30 seconds).

**Option 1: Generate test audio with ffmpeg**
```bash
# If you have ffmpeg installed, generate a 5-second silent audio
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 5 -q:a 9 -acodec libmp3lame test_audio.mp3
```

**Option 2: Record audio with macOS**
```bash
# Record 5 seconds of audio
rec -r 44100 -c 1 -b 16 test_audio.wav trim 0 5
```

**Send the audio to the API:**
```bash
curl -X POST "http://localhost:8000/api/talk" \
  -F "audio=@test_audio.mp3" \
  -F "session_id=test-session-123"
```

Expected response:
```json
{
  "session_id": "test-session-123",
  "user_transcript": "...",
  "assistant_reply_text": "...",
  "feedback": {
    "corrections": [],
    "better_phrases": [],
    "follow_up_question": "..."
  },
  "assistant_audio": {
    "format": "mp3",
    "data_base64": "..."
  }
}
```

#### Save and Play TTS Response

To decode and play the base64 audio:

```bash
# Extract the base64 data and save to file
curl -X POST "http://localhost:8000/api/talk" \
  -F "audio=@test_audio.mp3" \
  | jq -r '.assistant_audio.data_base64' \
  | base64 -d \
  > response.mp3

# Play the audio (macOS)
afplay response.mp3

# Or use VLC/any other player
vlc response.mp3
```

### 6. Verify Database

After a successful request, check the database:
```bash
sqlite3 service/aitutor.db "SELECT * FROM conversations ORDER BY id DESC LIMIT 1;"
```

## Milestone 2: Frontend Installation & Testing

### 1. Install Dependencies

```bash
cd client
npm install
```

### 2. Configure Environment (Optional)

```bash
cd client
cp .env.local.example .env.local
# Edit .env.local if backend runs on different port
# Default: NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3. Start Frontend Dev Server

```bash
cd client
npm run dev
```

Frontend will start at `http://localhost:3000`

### 4. Complete Smoke Test

**Prerequisites:**
- Backend server running on `http://localhost:8000`
- Frontend server running on `http://localhost:3000`
- Microphone available

**Steps:**

1. Open `http://localhost:3000` in your browser
2. Grant microphone permissions when prompted
3. Click the microphone button to start recording
4. Speak a short English sentence (e.g., "Hello, how are you today?")
5. Click the button again to stop recording
6. Wait for processing:
   - Status changes from "Uploading..." to "Generating feedback..."
7. Verify results:
   - ✅ See your transcript under "You said:"
   - ✅ See tutor response under "Tutor:"
   - ✅ See any corrections (max 2) in feedback cards
   - ✅ See follow-up question
   - ✅ Hear tutor voice response (auto-plays or click "Play Voice" button)
8. Click "Continue Practice" to try another sentence

**Expected UI Flow:**
```
[Idle] → [Recording...] → [Uploading...] → [Generating feedback...] → [Playing response...] → [Complete!]
```

### 5. Troubleshooting

**Microphone not working:**
- Check browser permissions for microphone access
- Try a different browser (Chrome/Firefox recommended)

**Can't connect to backend:**
- Ensure backend is running on port 8000
- Check `client/.env.local` for correct API URL

**No audio playback:**
- Check browser console for errors
- Ensure audio format is supported by your browser

## Running Both Services Simultaneously

### Option 1: Separate Terminal Windows

**Terminal 1 (Backend):**
```bash
cd service
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 (Frontend):**
```bash
cd client
npm run dev
```

### Option 2: Single Command (using &)

```bash
# In project root directory
cd service && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
cd client && npm run dev
```

## Development Progress

- ✅ Milestone 0: Project setup (.gitignore, .env.example, README)
- ✅ Milestone 1: Backend implementation (FastAPI, STT, LLM, TTS, SQLite)
- ✅ Milestone 2: Frontend implementation (Next.js client)

See [docs/SPEC.md](docs/SPEC.md) for technical specifications.

## License

TBD
