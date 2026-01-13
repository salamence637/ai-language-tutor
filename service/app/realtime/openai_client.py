"""
OpenAI Realtime API Integration

This module handles the WebSocket connection to OpenAI's Realtime API,
including session management and audio event handling.
"""

import asyncio
import json
import base64
from typing import Optional
import websockets
from websockets.exceptions import ConnectionClosed

from ..config import settings


class OpenAIRealtimeClient:
    """Client for OpenAI Realtime API WebSocket connection."""

    def __init__(self, model: str = "gpt-4o-realtime-preview", voice: str = "shimmer"):
        """Initialize the Realtime API client.

        Args:
            model: The model to use (e.g., gpt-4o-realtime-preview, gpt-4o-mini-realtime-preview)
            voice: The voice to use (alloy, echo, shimmer, nova)
        """
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.session_id: Optional[str] = None
        self.model = model
        self.voice = voice

    async def connect(self) -> str:
        """
        Connect to OpenAI Realtime API.

        Returns:
            Session ID
        """
        url = f"wss://api.openai.com/v1/realtime?model={self.model}"

        headers = {
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
            "OpenAI-Beta": "realtime=v1"
        }

        print(f"Connecting to OpenAI Realtime API with model: {self.model}...")
        self.ws = await websockets.connect(url, extra_headers=headers)
        print("Connected!")

        # Send session configuration
        await self.send_session_update()

        # Wait for session.created event
        response = await self.recv_message()
        if response.get("type") == "session.created":
            self.session_id = response.get("session", {}).get("id")
            print(f"Session created: {self.session_id}")
            return self.session_id

        raise Exception("Failed to create session")

    async def send_session_update(self):
        """Send session update configuration to OpenAI."""
        session_config = {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": "You are a friendly and encouraging English tutor. Speak naturally with varying intonation, pace, and emotional expression - just like a real human conversation. Use pauses, emphasis, and conversational tone. Be warm and supportive. Keep responses brief and helpful. Don't sound robotic or monotonous. IMPORTANT: If you're unsure about what the user said, ask them to repeat or clarify. Don't guess - ask for clarification when something seems unclear or ambiguous.",
                "voice": self.voice,
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "input_audio_transcription": {
                    "model": "whisper-1"
                },
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 500
                }
            }
        }

        await self.ws.send(json.dumps(session_config))
        print("Session configuration sent")

    async def send_audio(self, audio_data: bytes):
        """
        Send audio data to OpenAI.

        Args:
            audio_data: Raw audio bytes (PCM16 format)
        """
        if not self.ws:
            raise Exception("Not connected to OpenAI Realtime API")

        # Convert PCM16 bytes to base64
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')

        message = {
            "type": "input_audio_buffer.append",
            "audio": audio_base64
        }

        await self.ws.send(json.dumps(message))

    async def commit_audio(self):
        """Signal that audio input is complete."""
        message = {"type": "input_audio_buffer.commit"}
        await self.ws.send(json.dumps(message))

    async def create_response(self):
        """Request a response from the model."""
        message = {"type": "response.create"}
        await self.ws.send(json.dumps(message))

    async def recv_message(self) -> dict:
        """
        Receive a message from OpenAI.

        Returns:
            Parsed JSON message
        """
        if not self.ws:
            raise Exception("Not connected to OpenAI Realtime API")

        message_str = await self.ws.recv()
        return json.loads(message_str)

    async def listen(self):
        """
        Listen for events from OpenAI and handle them.

        This runs in a loop and processes:
        - session.created
        - session.updated
        - response.audio.delta (audio chunks)
        - response.audio_transcript.delta (transcript updates)
        - input_audio_transcription.delta (user transcript)

        Yields:
            Event dictionaries to be forwarded to the client
        """
        try:
            async for message_str in self.ws:
                message = json.loads(message_str)
                message_type = message.get("type")

                print(f"Received event from OpenAI: {message_type}")

                # Handle session events
                if message_type == "session.created":
                    print("Session created event - not forwarding to client")
                elif message_type == "session.updated":
                    print("Session updated event - not forwarding to client")

                # Handle audio responses
                elif message_type == "response.audio.delta":
                    # Audio chunk from AI
                    audio_base64 = message.get("delta", "")
                    if audio_base64:
                        print(f"Yielding audio event, base64 length: {len(audio_base64)}")
                        yield {
                            "type": "audio",
                            "audio": audio_base64
                        }

                # Handle transcript updates
                elif message_type == "response.audio_transcript.delta":
                    delta = message.get("delta", "")
                    yield {
                        "type": "ai_transcript",
                        "text": delta
                    }

                # Handle user transcript
                elif message_type == "conversation.item.input_audio_transcription.delta":
                    delta = message.get("delta", "")
                    yield {
                        "type": "user_transcript",
                        "text": delta
                    }

                # Handle response started/ended
                elif message_type == "response.started":
                    response_id = message.get("response", {}).get("id")
                    yield {
                        "type": "response_started",
                        "response_id": response_id
                    }

                elif message_type == "response.done":
                    response_id = message.get("response", {}).get("id")
                    yield {
                        "type": "response_done",
                        "response_id": response_id
                    }

                else:
                    print(f"Unhandled event type: {message_type}")

        except ConnectionClosed:
            print("OpenAI WebSocket connection closed")
        except Exception as e:
            print(f"Error in listen loop: {e}")
            import traceback
            traceback.print_exc()

    async def close(self):
        """Close the connection to OpenAI."""
        if self.ws:
            await self.ws.close()
            self.ws = None
