import base64
from typing import Tuple
from openai import OpenAI
from ..config import settings


def text_to_speech(text: str) -> Tuple[str, bytes]:
    """
    Convert text to speech using OpenAI TTS API.

    Args:
        text: Text to convert to speech

    Returns:
        Tuple of (format, audio_bytes)

    Raises:
        Exception: If TTS generation fails
    """
    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    try:
        response = client.audio.speech.create(
            model=settings.TTS_MODEL,
            voice=settings.TTS_VOICE,
            input=text
        )

        audio_bytes = response.content
        return "mp3", audio_bytes

    except Exception as e:
        raise Exception(f"TTS_FAILED: {str(e)}")


def audio_to_base64(audio_bytes: bytes) -> str:
    """Convert audio bytes to base64 string."""
    return base64.b64encode(audio_bytes).decode("utf-8")
