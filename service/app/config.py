import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Settings:
    """Application settings from environment variables."""

    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    DATABASE_PATH: str = os.getenv("DATABASE_PATH", "./aitutor.db")
    MAX_AUDIO_LENGTH_SECONDS: int = int(os.getenv("MAX_AUDIO_LENGTH_SECONDS", "30"))

    # OpenAI model configurations
    STT_MODEL: str = "gpt-4o-transcribe"
    LLM_MODEL: str = "gpt-4o-mini"
    TTS_MODEL: str = "gpt-4o-mini-tts"
    TTS_VOICE: str = "alloy"

settings = Settings()
