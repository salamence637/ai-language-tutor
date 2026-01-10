import os
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing the app
os.environ["OPENAI_API_KEY"] = "test-key-sk-12345"
os.environ["DATABASE_PATH"] = "./test_aitutor.db"

from app.main import app


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


def test_empty_audio_returns_bad_audio(client, monkeypatch):
    """Test that empty audio returns BAD_AUDIO error."""

    def mock_transcribe(*args, **kwargs):
        return ""

    # Import here to avoid circular dependency
    import app.services.stt as stt_module
    monkeypatch.setattr(stt_module, "transcribe_audio", mock_transcribe)

    # Create empty file
    from io import BytesIO
    empty_content = BytesIO(b"")

    response = client.post(
        "/api/talk",
        files={"audio": ("test.webm", empty_content, "audio/webm")}
    )

    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
    assert "error" in data["detail"]
    assert data["detail"]["error"]["code"] == "BAD_AUDIO"


def test_too_long_audio_returns_too_long(client, monkeypatch):
    """Test that audio exceeding max length returns TOO_LONG error."""

    # Mock audio duration check to return a value over limit
    import app.main as main_module

    original_duration = main_module.get_audio_duration

    def mock_duration_too_long(*args, **kwargs):
        return 35.0  # Over 30 second limit

    monkeypatch.setattr(main_module, "get_audio_duration", mock_duration_too_long)

    # Create minimal valid audio content
    from io import BytesIO
    audio_content = BytesIO(b"fake audio data")

    response = client.post(
        "/api/talk",
        files={"audio": ("test.webm", audio_content, "audio/webm")}
    )

    # Clean up - restore original function
    monkeypatch.setattr(main_module, "get_audio_duration", original_duration)

    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
    assert "error" in data["detail"]
    assert data["detail"]["error"]["code"] == "TOO_LONG"


def test_normal_audio_returns_success(client, monkeypatch):
    """Test that normal audio returns successful response with all fields."""

    # Initialize database for test
    import app.database as db_module
    db_module.init_db()

    # Mock audio duration
    def mock_duration(*args, **kwargs):
        return 5.0  # Well under the limit

    # Mock STT
    def mock_transcribe(*args, **kwargs):
        return "Hello, how are you today?"

    # Mock LLM
    def mock_feedback(user_transcript):
        return {
            "assistant_reply_text": "Great job! Your pronunciation is clear.",
            "feedback": {
                "corrections": [],
                "better_phrases": [],
                "follow_up_question": "What did you do yesterday?"
            }
        }

    # Mock TTS
    def mock_tts(text):
        return "mp3", b"fake mp3 audio data"

    # Mock base64 conversion
    def mock_base64(audio_bytes):
        return "ZmFrZSBtcDMgYXVkaW8gZGF0YQ=="  # base64 of "fake mp3 audio data"

    # Mock database save
    def mock_save(*args, **kwargs):
        return 1

    # Apply mocks to main.py where they're imported
    import app.main as main_module

    monkeypatch.setattr(main_module, "get_audio_duration", mock_duration)
    monkeypatch.setattr(main_module, "transcribe_audio", mock_transcribe)
    monkeypatch.setattr(main_module, "generate_feedback", mock_feedback)
    monkeypatch.setattr(main_module, "text_to_speech", mock_tts)
    monkeypatch.setattr(main_module, "audio_to_base64", mock_base64)
    monkeypatch.setattr(db_module, "save_conversation", mock_save)

    # Create normal audio content
    from io import BytesIO
    audio_content = BytesIO(b"normal audio content")

    response = client.post(
        "/api/talk",
        files={"audio": ("test.webm", audio_content, "audio/webm")}
    )

    assert response.status_code == 200
    data = response.json()

    # Verify all required fields
    assert "session_id" in data
    assert "user_transcript" in data
    assert data["user_transcript"] == "Hello, how are you today?"
    assert "assistant_reply_text" in data
    assert data["assistant_reply_text"] == "Great job! Your pronunciation is clear."
    assert "feedback" in data
    assert "corrections" in data["feedback"]
    assert len(data["feedback"]["corrections"]) <= 2
    assert "follow_up_question" in data["feedback"]
    assert "assistant_audio" in data
    assert "format" in data["assistant_audio"]
    assert data["assistant_audio"]["format"] == "mp3"
    assert "data_base64" in data["assistant_audio"]


def test_stt_failure_returns_stt_failed(client, monkeypatch):
    """Test that STT failure returns STT_FAILED error."""

    def mock_duration(*args, **kwargs):
        return 5.0

    def mock_transcribe_error(*args, **kwargs):
        raise Exception("STT connection failed")

    import app.main as main_module
    monkeypatch.setattr(main_module, "get_audio_duration", mock_duration)
    monkeypatch.setattr(main_module, "transcribe_audio", mock_transcribe_error)

    from io import BytesIO
    audio_content = BytesIO(b"audio content")

    response = client.post(
        "/api/talk",
        files={"audio": ("test.webm", audio_content, "audio/webm")}
    )

    assert response.status_code == 500
    data = response.json()
    assert "detail" in data
    assert "error" in data["detail"]
    assert "STT_FAILED" in data["detail"]["error"]["code"] or "SERVER_ERROR" in data["detail"]["error"]["code"]


def test_llm_failure_returns_llm_failed(client, monkeypatch):
    """Test that LLM failure returns LLM_FAILED error."""

    def mock_duration(*args, **kwargs):
        return 5.0

    def mock_transcribe(*args, **kwargs):
        return "Hello world"

    def mock_feedback_error(user_transcript):
        raise Exception("LLM_FAILED: Rate limit exceeded")

    import app.main as main_module
    monkeypatch.setattr(main_module, "get_audio_duration", mock_duration)
    monkeypatch.setattr(main_module, "transcribe_audio", mock_transcribe)
    monkeypatch.setattr(main_module, "generate_feedback", mock_feedback_error)

    from io import BytesIO
    audio_content = BytesIO(b"audio content")

    response = client.post(
        "/api/talk",
        files={"audio": ("test.webm", audio_content, "audio/webm")}
    )

    assert response.status_code == 500
    data = response.json()
    assert "detail" in data
    assert "error" in data["detail"]
    assert "LLM_FAILED" in data["detail"]["error"]["code"] or "SERVER_ERROR" in data["detail"]["error"]["code"]


def test_tts_failure_returns_tts_failed(client, monkeypatch):
    """Test that TTS failure returns TTS_FAILED error."""

    def mock_duration(*args, **kwargs):
        return 5.0

    def mock_transcribe(*args, **kwargs):
        return "Hello world"

    def mock_feedback(user_transcript):
        return {
            "assistant_reply_text": "Hello!",
            "feedback": {
                "corrections": [],
                "better_phrases": [],
                "follow_up_question": "How are you?"
            }
        }

    def mock_tts_error(text):
        raise Exception("TTS_FAILED: Invalid voice")

    import app.main as main_module
    monkeypatch.setattr(main_module, "get_audio_duration", mock_duration)
    monkeypatch.setattr(main_module, "transcribe_audio", mock_transcribe)
    monkeypatch.setattr(main_module, "generate_feedback", mock_feedback)
    monkeypatch.setattr(main_module, "text_to_speech", mock_tts_error)

    from io import BytesIO
    audio_content = BytesIO(b"audio content")

    response = client.post(
        "/api/talk",
        files={"audio": ("test.webm", audio_content, "audio/webm")}
    )

    assert response.status_code == 500
    data = response.json()
    assert "detail" in data
    assert "error" in data["detail"]
    assert "TTS_FAILED" in data["detail"]["error"]["code"] or "SERVER_ERROR" in data["detail"]["error"]["code"]
