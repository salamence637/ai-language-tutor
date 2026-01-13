"""
Realtime API routes for WebRTC signaling.
"""

import uuid
import base64
import secrets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request, Response
from pydantic import BaseModel

from .session import create_realtime_session, get_session, close_session
from ..config import settings
from ..usage import get_or_create_client_usage, MAX_AI_MS

router = APIRouter(prefix="/api/realtime", tags=["realtime"])


class SDPOffer(BaseModel):
    """SDP offer from browser."""
    sdp: str
    model: str = "gpt-4o-realtime-preview"  # Default model
    voice: str = "shimmer"  # Default voice


class SDPAnswer(BaseModel):
    """SDP answer from OpenAI."""
    sdp: str
    type: str


def create_sdp_answer_from_offer(offer_sdp_b64: str) -> str:
    """
    Create a basic SDP answer from an offer by modifying necessary attributes.

    This is a temporary solution until full OpenAI Realtime API integration.
    """
    try:
        # Decode the base64 SDP offer
        offer_sdp = base64.b64decode(offer_sdp_b64).decode('utf-8')

        # Convert offer to answer by modifying SDP attributes
        answer_lines = []
        for line in offer_sdp.split('\n'):
            if line.startswith('a=setup:'):
                # Change setup from actpass to passive for answer
                answer_lines.append('a=setup:passive')
            elif line.startswith('a=sendrecv'):
                # Keep sendrecv as is
                answer_lines.append(line)
            elif line.startswith('a=sendonly'):
                # Change sendonly to recvonly
                answer_lines.append('a=recvonly')
            elif line.startswith('m='):
                # Change media direction
                answer_lines.append(line)
            else:
                answer_lines.append(line)

        answer_sdp = '\n'.join(answer_lines)

        # Encode back to base64
        return base64.b64encode(answer_sdp.encode('utf-8')).decode('utf-8')
    except Exception as e:
        print(f"Error creating SDP answer: {e}")
        # Fallback: return the offer as-is
        return offer_sdp_b64


@router.post("/offer")
async def create_webrtc_offer(offer: SDPOffer, request: Request, response: Response):
    """
    Receive SDP offer from browser and create Realtime session.

    This creates a session with OpenAI Realtime API and returns session info.
    """
    session_id = str(uuid.uuid4())
    client_id = (
        request.headers.get("X-Client-Id")
        or request.cookies.get("client_id")
        or secrets.token_urlsafe(16)
    )
    if "client_id" not in request.cookies:
        response.set_cookie(
            key="client_id",
            value=client_id,
            max_age=60 * 60 * 24 * 30,
            httponly=True,
            samesite=settings.COOKIE_SAMESITE,
            secure=settings.COOKIE_SECURE,
        )

    try:
        usage = get_or_create_client_usage(client_id)
        if usage.ai_ms >= MAX_AI_MS:
            return {
                "error": "Time usage limit exceeded.",
                "type": "error"
            }

        # Create new session with specified model and voice
        session = await create_realtime_session(
            client_id=client_id,
            session_id=session_id,
            model=offer.model,
            voice=offer.voice
        )

        # Return session info (SDP answer not needed for this implementation)
        return {
            "session_id": session_id,
            "type": "answer",
            "sdp": offer.sdp,  # Echo back for WebRTC compatibility
            "status": "connected"
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {
            "error": f"Failed to create session: {str(e)}",
            "type": "error"
        }


@router.get("/limit")
async def get_limit_status(request: Request, response: Response):
    client_id = (
        request.headers.get("X-Client-Id")
        or request.cookies.get("client_id")
        or secrets.token_urlsafe(16)
    )
    if "client_id" not in request.cookies:
        response.set_cookie(
            key="client_id",
            value=client_id,
            max_age=60 * 60 * 24 * 30,
            httponly=True,
            samesite=settings.COOKIE_SAMESITE,
            secure=settings.COOKIE_SECURE,
        )

    usage = get_or_create_client_usage(client_id)
    return {
        "limit_reached": usage.ai_ms >= MAX_AI_MS
    }


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time audio streaming.

    Browser connects here to:
    - Send audio data (base64 encoded)
    - Receive AI audio responses
    - Receive transcripts
    """
    await websocket.accept()

    session = await get_session(session_id)
    if not session:
        await websocket.send_json({"error": "Session not found"})
        await websocket.close()
        return

    # Store client WebSocket
    session.client_ws = websocket

    try:
        print(f"WebSocket session {session_id} listening for messages...")
        while True:
            # Receive audio or control messages from browser
            data = await websocket.receive_json()
            message_type = data.get("type")
            print(f"Received message type: {message_type}")

            if message_type == "audio":
                # Forward audio to OpenAI
                audio_data = data.get("audio", "")
                print(f"Received audio data length: {len(audio_data)}")
                if audio_data:
                    await session.send_audio(audio_data)

            elif message_type == "stop_speaking":
                # Commit audio buffer and trigger response
                print("Received stop_speaking signal")
                if session.openai_client:
                    await session.openai_client.commit_audio()
                    await session.openai_client.create_response()

    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        await close_session(session_id)
