"""
OpenAI Realtime API Session Management

This module manages active Realtime API sessions and handles audio streaming.
"""

import asyncio
import uuid
from typing import Dict, Optional
from fastapi import WebSocket

from .openai_client import OpenAIRealtimeClient
from ..usage import get_or_create_client_usage, MAX_AI_MS


class RealtimeSession:
    """Manages a single Realtime API session."""

    def __init__(self, session_id: str, client_id: str, model: str = "gpt-4o-realtime-preview", voice: str = "shimmer"):
        self.session_id = session_id
        self.client_ws: Optional[WebSocket] = None
        self.openai_client: Optional[OpenAIRealtimeClient] = None
        self.is_active = False
        self.model = model
        self.voice = voice
        self.usage = get_or_create_client_usage(client_id)

    async def initialize(self):
        """Initialize OpenAI Realtime API connection."""
        self.openai_client = OpenAIRealtimeClient(
            model=self.model,
            voice=self.voice
        )
        await self.openai_client.connect()
        self.is_active = True

        # Start listening for events in background
        self.listen_task = asyncio.create_task(self._listen_to_openai())

    async def _listen_to_openai(self):
        """Listen for events from OpenAI and forward to client."""
        if not self.openai_client:
            return

        try:
            # listen() is an async generator that yields events
            async for event in self.openai_client.listen():
                print(f"Forwarding event to client: {event.get('type')}")
                # Forward event to client
                if self.client_ws:
                    try:
                        if event.get("type") == "audio":
                            audio_base64 = event.get("audio", "")
                            if audio_base64:
                                import base64
                                audio_bytes = base64.b64decode(audio_base64)
                                ai_ms = int((len(audio_bytes) / 2) / 24_000 * 1000)
                                if not self.usage.add_ai_ms(ai_ms):
                                    await self._send_limit_error()
                                    await self.close()
                                    break

                        await self.client_ws.send_json(event)
                        print(f"Successfully sent {event.get('type')} to client")
                    except Exception as e:
                        print(f"Error sending to client: {e}")
                        import traceback
                        traceback.print_exc()
                        break
                else:
                    print("Client WebSocket is None, cannot send event")
        except Exception as e:
            print(f"Error listening to OpenAI: {e}")
            import traceback
            traceback.print_exc()

    async def send_audio(self, audio_base64: str):
        """Send audio from browser to OpenAI."""
        if not self.openai_client:
            raise Exception("OpenAI client not initialized")

        import base64
        audio_bytes = base64.b64decode(audio_base64)
        await self.openai_client.send_audio(audio_bytes)

    async def _send_limit_error(self):
        if self.client_ws:
            await self.client_ws.send_json({
                "type": "error",
                "code": "LIMIT_REACHED",
                "message": "Time usage limit exceeded."
            })

    async def close(self):
        """Close the session and all connections."""
        self.is_active = False

        # Cancel the listen task
        if hasattr(self, 'listen_task'):
            current_task = asyncio.current_task()
            if self.listen_task is not current_task:
                self.listen_task.cancel()
                try:
                    await self.listen_task
                except asyncio.CancelledError:
                    pass

        if self.openai_client:
            await self.openai_client.close()

        if self.client_ws:
            try:
                await self.client_ws.close()
            except Exception as e:
                print(f"Error closing client WebSocket: {e}")


# Active sessions storage
active_sessions: Dict[str, RealtimeSession] = {}


async def create_realtime_session(
    client_id: str,
    session_id: Optional[str] = None,
    model: str = "gpt-4o-realtime-preview",
    voice: str = "shimmer"
) -> RealtimeSession:
    """Create a new Realtime API session."""
    if not session_id:
        session_id = str(uuid.uuid4())

    session = RealtimeSession(session_id, client_id, model=model, voice=voice)
    await session.initialize()
    active_sessions[session_id] = session
    return session


async def get_session(session_id: str) -> Optional[RealtimeSession]:
    """Get an active session by ID."""
    return active_sessions.get(session_id)


async def close_session(session_id: str):
    """Close a Realtime API session."""
    if session_id in active_sessions:
        session = active_sessions[session_id]
        await session.close()
        del active_sessions[session_id]
