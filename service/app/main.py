import uuid
from contextlib import contextmanager
from typing import Optional

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import audiofile

from .config import settings
from .database import init_db, save_conversation
from .services.stt import transcribe_audio
from .services.llm import generate_feedback
from .services.tts import text_to_speech, audio_to_base64


# Pydantic models for request/response
class ErrorResponse(BaseModel):
    error: dict


def get_audio_duration(audio_bytes: bytes) -> float:
    """Get audio duration in seconds."""
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp.flush()
        try:
            duration = audiofile.duration(tmp.name)
            return duration
        finally:
            import os
            os.unlink(tmp.name)


# Initialize FastAPI app
app = FastAPI(title="AI Tutor API", version="0.1.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup."""
    init_db()


@app.post("/api/talk")
async def talk(
    audio: UploadFile = File(..., description="Audio file (webm/wav/mp3)"),
    session_id: Optional[str] = Form(None, description="Session ID (optional)")
):
    """
    Process user audio and return tutor feedback.

    - **audio**: Audio file (webm/wav/mp3)
    - **session_id**: Optional session ID for conversation tracking

    Returns transcript, feedback, and TTS audio.
    """

    # Generate session_id if not provided
    if not session_id:
        session_id = str(uuid.uuid4())

    try:
        # Read audio bytes
        audio_bytes = await audio.read()

        # Validate audio is not empty
        if len(audio_bytes) == 0:
            raise HTTPException(
                status_code=400,
                detail={"error": {"code": "BAD_AUDIO", "message": "Audio file is empty"}}
            )

        # Validate audio duration
        try:
            duration = get_audio_duration(audio_bytes)
            if duration > settings.MAX_AUDIO_LENGTH_SECONDS:
                raise HTTPException(
                    status_code=400,
                    detail={"error": {"code": "TOO_LONG", "message": f"Audio exceeds maximum length of {settings.MAX_AUDIO_LENGTH_SECONDS} seconds"}}
                )
        except Exception as e:
            # If we can't check duration, log but continue
            import logging
            logging.warning(f"Could not check audio duration: {e}")
            if "TOO_LONG" in str(e):
                raise
            # Continue anyway - let STT handle invalid audio
            pass

        # Step 1: STT - Transcribe audio
        try:
            user_transcript = transcribe_audio(audio_bytes, audio.filename)
        except Exception as e:
            error_code = str(e).split(":")[0] if ":" in str(e) else "STT_FAILED"
            raise HTTPException(
                status_code=500,
                detail={"error": {"code": error_code, "message": str(e)}}
            )

        # Validate transcript
        if not user_transcript or user_transcript.strip() == "":
            raise HTTPException(
                status_code=400,
                detail={"error": {"code": "BAD_AUDIO", "message": "Could not transcribe audio"}}
            )

        # Step 2: LLM - Generate feedback
        try:
            llm_result = generate_feedback(user_transcript)
            assistant_reply_text = llm_result["assistant_reply_text"]
            feedback = llm_result["feedback"]
        except Exception as e:
            error_code = str(e).split(":")[0] if ":" in str(e) else "LLM_FAILED"
            raise HTTPException(
                status_code=500,
                detail={"error": {"code": error_code, "message": str(e)}}
            )

        # Step 3: TTS - Generate audio response
        try:
            audio_format, audio_bytes_result = text_to_speech(assistant_reply_text)
            audio_base64 = audio_to_base64(audio_bytes_result)
        except Exception as e:
            error_code = str(e).split(":")[0] if ":" in str(e) else "TTS_FAILED"
            raise HTTPException(
                status_code=500,
                detail={"error": {"code": error_code, "message": str(e)}}
            )

        # Save to database
        import json
        save_conversation(
            session_id=session_id,
            user_transcript=user_transcript,
            assistant_reply_text=assistant_reply_text,
            feedback_json=json.dumps(feedback)
        )

        # Return success response
        return {
            "session_id": session_id,
            "user_transcript": user_transcript,
            "assistant_reply_text": assistant_reply_text,
            "feedback": feedback,
            "assistant_audio": {
                "format": audio_format,
                "data_base64": audio_base64
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "SERVER_ERROR", "message": str(e)}}
        )


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "AI Tutor API is running"}
