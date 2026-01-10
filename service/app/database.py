import sqlite3
from datetime import datetime
from typing import Optional
from .config import settings


def get_db_connection():
    """Get a database connection."""
    conn = sqlite3.connect(settings.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database schema."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            user_transcript TEXT NOT NULL,
            assistant_reply_text TEXT NOT NULL,
            feedback_json TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()


def save_conversation(
    session_id: str,
    user_transcript: str,
    assistant_reply_text: str,
    feedback_json: str
) -> int:
    """Save a conversation to the database."""
    conn = get_db_connection()
    cursor = conn.cursor()

    timestamp = datetime.utcnow().isoformat()
    cursor.execute("""
        INSERT INTO conversations (session_id, timestamp, user_transcript, assistant_reply_text, feedback_json)
        VALUES (?, ?, ?, ?, ?)
    """, (session_id, timestamp, user_transcript, assistant_reply_text, feedback_json))

    row_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return row_id
