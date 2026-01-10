import json
from openai import OpenAI
from ..config import settings


def generate_feedback(user_transcript: str) -> dict:
    """
    Generate tutor feedback using OpenAI LLM.

    Args:
        user_transcript: User's spoken text

    Returns:
        Dictionary with assistant_reply_text and feedback (strict JSON)

    Raises:
        Exception: If LLM generation fails
    """
    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    system_prompt = """You are an encouraging English tutor. Your task is to:
1. Be positive and supportive
2. Identify at most 2 important issues (grammar, wording, or fluency)
3. Always include exactly 1 follow-up question

You MUST respond with a JSON object (no markdown, no extra text) in this exact format:
{
  "assistant_reply_text": "Your encouraging response text here",
  "feedback": {
    "corrections": [
      {
        "type": "grammar|wording|fluency",
        "original": "original text",
        "suggestion": "better version",
        "explanation": "brief explanation"
      }
    ],
    "better_phrases": [
      {"original": "original phrase", "suggestion": "better phrase"}
    ],
    "follow_up_question": "Your follow-up question here"
  }
}

Rules:
- corrections array: max 2 items
- better_phrases: optional array
- follow_up_question: exactly 1, required
- All text must be concise and helpful
"""

    user_prompt = f"Student said: \"{user_transcript}\"\n\nProvide feedback as JSON."

    try:
        response = client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.7
        )

        content = response.choices[0].message.content

        # Parse and validate JSON
        result = json.loads(content)

        # Validate required fields
        if "assistant_reply_text" not in result:
            result["assistant_reply_text"] = "Great effort! Let's continue practicing."

        if "feedback" not in result:
            result["feedback"] = {"corrections": [], "better_phrases": [], "follow_up_question": "What would you like to talk about next?"}

        feedback = result["feedback"]
        if "follow_up_question" not in feedback:
            feedback["follow_up_question"] = "What would you like to talk about next?"
        if "corrections" not in feedback:
            feedback["corrections"] = []
        if "better_phrases" not in feedback:
            feedback["better_phrases"] = []

        # Ensure max 2 corrections
        feedback["corrections"] = feedback["corrections"][:2]

        return result

    except json.JSONDecodeError as e:
        raise Exception(f"LLM_FAILED: Invalid JSON response - {str(e)}")
    except Exception as e:
        raise Exception(f"LLM_FAILED: {str(e)}")
