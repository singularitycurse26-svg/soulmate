"""Email integration for Soulmate OS.

Hybrid email system:
- Sending via Resend API (primary) or ImprovMX SMTP (fallback)
- Receiving via Gmail IMAP (emails forwarded by ImprovMX catch-all)
- Verification code extraction for AI agent account signups
- Email-to-SMS gateway support for texting

Credentials loaded from .env (gitignored).
"""

from __future__ import annotations

import os
import re
import time
import smtplib
import ssl
import imaplib
import email as email_lib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path


def _load_env() -> dict:
    """Load email config from .env file."""
    env = {
        "RESEND_API_KEY": os.environ.get("RESEND_API_KEY", ""),
        "SMTP_HOST": "smtp.improvmx.com",
        "SMTP_PORT": "587",
        "SMTP_USER": "noreply@soulmateos.de5.net",
        "SMTP_PASS": os.environ.get("IMPROVMX_PASSWORD", "SoulmateOS2026!"),
        "EMAIL_DOMAIN": "soulmateos.de5.net",
        "FROM_EMAIL": "Soulmate OS <noreply@soulmateos.de5.net>",
        "GMAIL_USER": os.environ.get("GMAIL_USER", "soulmate.ai.dev@gmail.com"),
        "GMAIL_APP_PASSWORD": os.environ.get("GMAIL_APP_PASSWORD", ""),
        "GMAIL_IMAP_HOST": "imap.gmail.com",
        "GMAIL_IMAP_PORT": "993",
    }
    env_path = Path(__file__).parent.parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("RESEND_API_KEY="):
                env["RESEND_API_KEY"] = line.split("=", 1)[1].strip()
            elif line.startswith("IMPROVMX_PASSWORD="):
                env["SMTP_PASS"] = line.split("=", 1)[1].strip()
            elif line.startswith("SMTP_USER="):
                env["SMTP_USER"] = line.split("=", 1)[1].strip()
            elif line.startswith("EMAIL_DOMAIN="):
                env["EMAIL_DOMAIN"] = line.split("=", 1)[1].strip()
            elif line.startswith("GMAIL_USER="):
                env["GMAIL_USER"] = line.split("=", 1)[1].strip()
            elif line.startswith("GMAIL_APP_PASSWORD="):
                env["GMAIL_APP_PASSWORD"] = line.split("=", 1)[1].strip()
    return env


def _send_via_smtp(to: str | list[str], subject: str, html: str, from_email: str, env: dict) -> str | None:
    """Send email via ImprovMX SMTP relay."""
    if isinstance(to, str):
        to = [to]

    msg = MIMEMultipart("alternative")
    msg["From"] = from_email
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html"))

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(env["SMTP_HOST"], int(env["SMTP_PORT"]), timeout=30) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(env["SMTP_USER"], env["SMTP_PASS"])
            server.sendmail(from_email, to, msg.as_string())
            server.quit()
        print(f"SMTP email sent to {to}")
        return f"smtp_{int(__import__('time').time())}"
    except Exception as e:
        print(f"SMTP send failed: {e}")
        return None


def _send_via_resend(to: str | list[str], subject: str, html: str, from_email: str, api_key: str) -> str | None:
    """Send email via Resend API (fallback)."""
    try:
        import resend
        resend.api_key = api_key
        if isinstance(to, str):
            to = [to]
        params = {"from": from_email, "to": to, "subject": subject, "html": html}
        r = resend.Emails.send(params)
        email_id = r["id"]
        print(f"Resend email sent to {to}: {email_id}")
        return email_id
    except Exception as e:
        print(f"Resend send failed: {e}")
        return None


def send_email(
    to: str | list[str],
    subject: str,
    html: str,
    from_email: str = "",
) -> str | None:
    """Send an email via ImprovMX SMTP (primary) or Resend (fallback).

    Args:
        to: Recipient email address or list of addresses.
        subject: Email subject line.
        html: HTML body content.
        from_email: Sender address (defaults to noreply@soulmateos.de5.net).

    Returns:
        Email ID if successful, None if failed.
    """
    env = _load_env()
    if not from_email:
        from_email = env["FROM_EMAIL"]

    if env["RESEND_API_KEY"]:
        resend_from = "Soulmate OS <onboarding@resend.dev>"
        result = _send_via_resend(to, subject, html, resend_from, env["RESEND_API_KEY"])
        if result:
            return result

    result = _send_via_smtp(to, subject, html, from_email, env)
    if result:
        return result

    print("All email sending methods failed")
    return None


# --- Email Receiving via Gmail IMAP ---

def _get_text_part(msg) -> str:
    """Extract text content from an email message object."""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            if ct == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode("utf-8", errors="replace")
            elif ct == "text/html":
                payload = part.get_payload(decode=True)
                if payload:
                    html = payload.decode("utf-8", errors="replace")
                    return re.sub(r"<[^>]+>", "", html)
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            return payload.decode("utf-8", errors="replace")
    return ""


def parse_forwarded_email(raw_email: str) -> dict:
    """Parse a forwarded email from ImprovMX to extract original sender/subject/body.

    ImprovMX forwards emails to Gmail, so the Gmail message has:
    - From: ImprovMX forwarder (or original sender preserved)
    - To: soulmate.ai.dev@gmail.com
    - Original headers may be in the body as forwarded content

    Returns dict with from_addr, to_addr, subject, body, date.
    """
    msg = email_lib.message_from_string(raw_email)

    from_addr = msg.get("From", "")
    to_addr = msg.get("To", "")
    subject = msg.get("Subject", "")
    date = msg.get("Date", "")
    body = _get_text_part(msg)

    # Try to extract original sender from forwarded content
    # ImprovMX typically preserves original From header
    fwd_patterns = [
        r"From:\s*(.+?)(?:\nTo:|\nSubject:|\nDate:|$)",
        r"-----\s*Original Message\s*-----.*?From:\s*(.+?)(?:\n)",
    ]
    for pattern in fwd_patterns:
        match = re.search(pattern, body, re.DOTALL | re.IGNORECASE)
        if match:
            original_from = match.group(1).strip()
            if original_from and "@" in original_from:
                from_addr = original_from
                break

    # Extract original subject from forwarded body
    fwd_subject = re.search(r"Subject:\s*(.+?)(?:\n)", body, re.IGNORECASE)
    if fwd_subject:
        original_subject = fwd_subject.group(1).strip()
        if original_subject:
            subject = original_subject

    return {
        "from_addr": from_addr.strip(),
        "to_addr": to_addr.strip(),
        "subject": subject.strip(),
        "body": body.strip(),
        "date": date.strip(),
    }


def poll_gmail_inbox(max_emails: int = 20, search_criteria: str = "UNSEEN") -> list[dict]:
    """Poll Gmail inbox via IMAP for emails forwarded by ImprovMX.

    Args:
        max_emails: Maximum number of emails to fetch.
        search_criteria: IMAP search criteria (default: UNSEEN).

    Returns:
        List of parsed email dicts with from_addr, to_addr, subject, body, date.
    """
    env = _load_env()
    gmail_user = env["GMAIL_USER"]
    gmail_pass = env["GMAIL_APP_PASSWORD"]

    if not gmail_pass:
        print("Gmail app password not configured — cannot poll inbox")
        return []

    emails = []
    try:
        mail = imaplib.IMAP4_SSL(env["GMAIL_IMAP_HOST"], int(env["GMAIL_IMAP_PORT"]))
        mail.login(gmail_user, gmail_pass)
        mail.select("INBOX")

        status, data = mail.search(None, search_criteria)
        if status != "OK":
            print(f"IMAP search failed: {status}")
            mail.logout()
            return []

        ids = data[0].split()
        if not ids:
            mail.logout()
            return []

        # Fetch most recent emails (reverse order)
        ids = ids[-max_emails:] if len(ids) > max_emails else ids

        for eid in reversed(ids):
            status, msg_data = mail.fetch(eid, "(RFC822)")
            if status == "OK" and msg_data and msg_data[0]:
                raw = msg_data[0][1]
                if isinstance(raw, bytes):
                    raw_str = raw.decode("utf-8", errors="replace")
                else:
                    raw_str = str(raw)
                parsed = parse_forwarded_email(raw_str)
                parsed["imap_id"] = eid.decode() if isinstance(eid, bytes) else str(eid)
                emails.append(parsed)

        mail.logout()
        print(f"IMAP polled {len(emails)} emails from Gmail")
    except Exception as e:
        print(f"IMAP poll failed: {e}")

    return emails


def store_email_in_sqlite(email_data: dict, user_id: int, db_path: str, folder: str = "inbox") -> int | None:
    """Store a parsed email in the SQLite emails table.

    Args:
        email_data: Dict from parse_forwarded_email or poll_gmail_inbox.
        user_id: User ID to associate with.
        db_path: Path to the email_accounts.db SQLite database.
        folder: Email folder (inbox, sent, etc.).

    Returns:
        Email ID if stored, None if duplicate or failed.
    """
    import sqlite3
    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        # Check for duplicate by subject + from + date
        c.execute(
            "SELECT id FROM emails WHERE user_id = ? AND from_addr = ? AND subject = ? AND created_at = ?",
            (user_id, email_data.get("from_addr", ""), email_data.get("subject", ""), email_data.get("date", ""))
        )
        if c.fetchone():
            conn.close()
            return None
        c.execute(
            "INSERT INTO emails (user_id, from_addr, to_addr, subject, body, folder) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, email_data.get("from_addr", ""), email_data.get("to_addr", ""),
             email_data.get("subject", ""), email_data.get("body", ""), folder)
        )
        email_id = c.lastrowid
        conn.commit()
        conn.close()
        return email_id
    except Exception as e:
        print(f"Failed to store email in SQLite: {e}")
        return None


def sync_inbox_from_gmail(user_id: int, db_path: str, max_emails: int = 20) -> dict:
    """Sync emails from Gmail IMAP to SQLite inbox.

    Args:
        user_id: User ID to associate emails with.
        db_path: Path to email_accounts.db.
        max_emails: Max emails to fetch.

    Returns:
        Dict with sync stats: {"fetched": N, "stored": N, "duplicates": N}
    """
    emails = poll_gmail_inbox(max_emails=max_emails)
    stored = 0
    duplicates = 0
    for email_data in emails:
        result = store_email_in_sqlite(email_data, user_id, db_path, "inbox")
        if result:
            stored += 1
        else:
            duplicates += 1
    return {"fetched": len(emails), "stored": stored, "duplicates": duplicates}


# --- Verification Code Extraction ---

def extract_verification_code(text: str) -> str | None:
    """Extract a verification code from email/SMS text.

    Looks for common patterns:
    - "code: 123456"
    - "verification code: 123456"
    - "your code is 123456"
    - "OTP: 123456"
    - Standalone 4-8 digit numbers

    Args:
        text: Email body or SMS text to parse.

    Returns:
        The extracted code as a string, or None if no code found.
    """
    if not text:
        return None

    # Pattern 1: Explicit code keywords followed by number
    keyword_patterns = [
        r"(?:verification\s+code|code|OTP|pin|password)\s*(?:is|:)?\s*(\d{4,8})",
        r"(?:your\s+code|enter\s+(?:this\s+)?code)\s*(?:is|:)?\s*(\d{4,8})",
        r"(\d{4,8})\s*(?:is\s+your|verification|confirm)",
    ]
    for pattern in keyword_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)

    # Pattern 2: Standalone 4-8 digit number on its own line
    standalone = re.search(r"^\s*(\d{4,8})\s*$", text, re.MULTILINE)
    if standalone:
        return standalone.group(1)

    # Pattern 3: Number in brackets or bold markers
    bracketed = re.search(r"[\[(<{](\d{4,8})[\])>}", text)
    if bracketed:
        return bracketed.group(1)

    # Pattern 4: "123-456" or "123 456" style codes
    hyphenated = re.search(r"(\d{3})[-\s](\d{3})", text)
    if hyphenated:
        return hyphenated.group(1) + hyphenated.group(2)

    return None


def wait_for_verification_email(
    timeout: int = 120,
    sender_filter: str | None = None,
    subject_filter: str | None = None,
    poll_interval: int = 10,
) -> dict | None:
    """Poll Gmail inbox until a verification email arrives, then extract the code.

    Args:
        timeout: Maximum seconds to wait.
        sender_filter: Only match emails from this sender (substring match).
        subject_filter: Only match emails with this subject (substring match).
        poll_interval: Seconds between polls.

    Returns:
        Dict with {"email": parsed_email, "code": extracted_code} or None on timeout.
    """
    start = time.time()
    seen_ids: set[str] = set()

    while time.time() - start < timeout:
        emails = poll_gmail_inbox(max_emails=10, search_criteria="ALL")

        for email_data in emails:
            imap_id = email_data.get("imap_id", "")
            if imap_id in seen_ids:
                continue
            seen_ids.add(imap_id)

            # Apply filters
            if sender_filter and sender_filter.lower() not in email_data.get("from_addr", "").lower():
                continue
            if subject_filter and subject_filter.lower() not in email_data.get("subject", "").lower():
                continue

            # Try to extract verification code
            code = extract_verification_code(email_data.get("body", ""))
            if code:
                print(f"Verification code found: {code} from {email_data.get('from_addr')}")
                return {"email": email_data, "code": code}

            # Also check subject for code
            code_from_subject = extract_verification_code(email_data.get("subject", ""))
            if code_from_subject:
                print(f"Verification code found in subject: {code_from_subject}")
                return {"email": email_data, "code": code_from_subject}

        time.sleep(poll_interval)

    print(f"wait_for_verification_email timed out after {timeout}s")
    return None


# --- Email-to-SMS Gateway ---

CARRIER_GATEWAYS = {
    "att": "txt.att.net",
    "verizon": "vtext.com",
    "t-mobile": "tmomail.net",
    "sprint": "messaging.sprintpcs.com",
    "boost": "sms.myboostmobile.com",
    "cricket": "sms.cricketwireless.net",
    "metro": "mymetropcs.com",
    "us-cellular": "email.uscc.net",
    "google-fi": "msg.fi.google.com",
    "virgin": "vmobl.com",
    "xfinity": "vtext.com",
    "ting": "message.ting.com",
    "consumer": "mailmymobile.net",
    "rogers": "pcs.rogers.com",
    "bell": "txt.bell.ca",
    "telus": "msg.telus.com",
    "fido": "fido.ca",
    "koodo": "msg.koodomobile.com",
    "virgin-ca": "vmobile.ca",
}


def send_sms_via_email(to_number: str, body: str, carrier: str, from_email: str = "") -> bool:
    """Send an SMS via email-to-SMS gateway using Resend API.

    Args:
        to_number: Phone number (digits only, will be normalized).
        body: SMS text (max 160 chars).
        carrier: Carrier key from CARRIER_GATEWAYS.
        from_email: Sender email address.

    Returns:
        True if sent successfully, False otherwise.
    """
    carrier = carrier.lower().strip()
    if carrier not in CARRIER_GATEWAYS:
        print(f"Unknown carrier: {carrier}")
        return False

    to_number = "".join(filter(str.isdigit, to_number))
    if len(to_number) == 10:
        to_number = "1" + to_number
    if len(to_number) < 11:
        print(f"Invalid phone number: {to_number}")
        return False

    body = body.strip()[:160]
    sms_email = f"{to_number}@{CARRIER_GATEWAYS[carrier]}"

    result = send_email(
        to=sms_email,
        subject="",
        html=f"<p>{body}</p>",
        from_email=from_email,
    )
    if result:
        print(f"SMS sent via email gateway: {sms_email}")
        return True
    return False


if __name__ == "__main__":
    send_email(
        to="soulmate.ai.dev@gmail.com",
        subject="Soulmate Email Test - soulmateos.de5.net",
        html="<h2>Email module working</h2><p>Sent from noreply@soulmateos.de5.net via ImprovMX SMTP</p>",
    )
