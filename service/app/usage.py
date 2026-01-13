"""
Client usage tracking for time-based limits (in-memory).
"""

from dataclasses import dataclass
from threading import Lock
from typing import Dict

from .config import settings


MAX_AI_MS = settings.MAX_AUDIO_LENGTH_SECONDS * 1000


@dataclass
class SessionUsage:
    ai_ms: int = 0

    def add_ai_ms(self, amount_ms: int) -> bool:
        if self.ai_ms + amount_ms > MAX_AI_MS:
            # Mark as exhausted so future checks block immediately.
            self.ai_ms = MAX_AI_MS
            return False
        self.ai_ms += amount_ms
        return True


_usage_lock = Lock()
_clients: Dict[str, SessionUsage] = {}


def get_or_create_client_usage(client_id: str) -> SessionUsage:
    with _usage_lock:
        usage = _clients.get(client_id)
        if not usage:
            usage = SessionUsage()
            _clients[client_id] = usage
        return usage


def clear_client_usage(client_id: str) -> None:
    with _usage_lock:
        _clients.pop(client_id, None)
