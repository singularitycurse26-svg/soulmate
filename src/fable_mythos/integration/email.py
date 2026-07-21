"""Email integration via Resend API.

Sends transactional emails for the Soulmate project.
API key is loaded from .env (gitignored).
"""

from __future__ import annotations

import os
from pathlib import Path


def _load_env() -> str:
    """Load Resend API key from .env file."""
    env_path = Path(__file__).parent.parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("RESEND_API_KEY="):
                return line.split("=", 1)[1].strip()
    return os.environ.get("RESEND_API_KEY", "")


def send_email(
    to: str | list[str],
    subject: str,
    html: str,
    from_email: str = "Soulmate <onboarding@resend.dev>",
) -> str | None:
    """Send an email via Resend.

    Args:
        to: Recipient email address or list of addresses.
        subject: Email subject line.
        html: HTML body content.
        from_email: Sender address (defaults to Resend's free domain).

    Returns:
        Email ID if successful, None if failed.
    """
    import resend

    api_key = _load_env()
    if not api_key:
        print("No RESEND_API_KEY found in .env or environment")
        return None

    resend.api_key = api_key

    if isinstance(to, str):
        to = [to]

    params = {
        "from": from_email,
        "to": to,
        "subject": subject,
        "html": html,
    }

    try:
        r = resend.Emails.send(params)
        email_id = r["id"]
        print(f"Email sent to {to}: {email_id}")
        return email_id
    except Exception as e:
        print(f"Failed to send email: {e}")
        return None


if __name__ == "__main__":
    send_email(
        to="soulmate.ai.dev@gmail.com",
        subject="Soulmate Email Module Test",
        html="<h2>Email module working</h2><p>Sent from soulmate/email.py</p>",
    )
