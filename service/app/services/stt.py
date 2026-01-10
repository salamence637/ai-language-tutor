import io
from openai import OpenAI
from ..config import settings


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """
    Transcribe audio using OpenAI STT API.

    Args:
        audio_bytes: Raw audio data
        filename: Original filename with extension

    Returns:
        Transcribed text

    Raises:
        Exception: If transcription fails
    """
    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    # Create a file-like object from bytes
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = filename

    try:
        transcription = client.audio.transcriptions.create(
            model=settings.STT_MODEL,
            file=audio_file,
            language="en"
        )
        return transcription.text
    except Exception as e:
        raise Exception(f"STT_FAILED: {str(e)}")
