#!/usr/bin/env python3
"""
Soulmate OS CLI — lets any AI agent (Cascade, Aider, Cline, etc.) 
interact with Soulmate OS APIs from the command line.

Usage:
  python soulmate-cli.py chat "check my balance"
  python soulmate-cli.py send-email --to john@example.com --subject "Hello" --body "Hi John"
  python soulmate-cli.py list-contacts
  python soulmate-cli.py check-balance
  python soulmate-cli.py read-inbox
  python soulmate-cli.py add-contact --name "John" --email "john@example.com"
  python soulmate-cli.py memories
  python soulmate-cli.py store-memory --type fact --content "User likes pizza"
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error

# Config
API_BASE = os.environ.get("SOULMATE_API_URL", "http://191.44.121.29:8546")
SESSION_TOKEN = os.environ.get("SOULMATE_SESSION_TOKEN", "")

# Try to load session token from vault file
if not SESSION_TOKEN:
    vault_paths = [
        os.path.expanduser("~/.soulmate/session_token"),
        os.path.expanduser("~/.fablemythos/soulmate_session.txt"),
    ]
    for p in vault_paths:
        if os.path.exists(p):
            with open(p, "r") as f:
                SESSION_TOKEN = f.read().strip()
            break

def api_call(endpoint, method="GET", data=None):
    url = f"{API_BASE}{endpoint}"
    headers = {
        "Content-Type": "application/json",
        "X-Session-Token": SESSION_TOKEN,
    }
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print(f"API Error {e.code}: {err_body}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

def cmd_chat(args):
    result = api_call("/v1/ai/chat", "POST", {"message": args.message})
    print(result.get("response", ""))
    if result.get("tools_used"):
        for tool in result["tools_used"]:
            print(f"\n[Tool: {tool['tool']}] → {json.dumps(tool['result'])}")
    if result.get("model"):
        print(f"\n[Model: {result['model']}, Memories used: {result.get('memories_used', 0)}]")

def cmd_send_email(args):
    result = api_call("/v1/email/send", "POST", {"to": args.to, "subject": args.subject, "body": args.body})
    print(f"Email sent to {args.to}")

def cmd_list_contacts(args):
    result = api_call("/v1/contacts")
    contacts = result.get("contacts", [])
    if not contacts:
        print("No contacts found.")
        return
    for c in contacts:
        print(f"  {c['name']}" + (f" <{c['email']}>" if c.get('email') else "") + (f" ({c['phone']})" if c.get('phone') else ""))

def cmd_add_contact(args):
    data = {"name": args.name}
    if args.email: data["email"] = args.email
    if args.phone: data["phone"] = args.phone
    result = api_call("/v1/contacts", "POST", data)
    print(f"Contact created: {args.name} (id: {result.get('id')})")

def cmd_check_balance(args):
    result = api_call("/v1/ai/chat", "POST", {"message": "Check my wallet balance"})
    print(result.get("response", ""))

def cmd_read_inbox(args):
    result = api_call("/v1/email/inbox")
    emails = result.get("emails", [])
    if not emails:
        print("Inbox is empty.")
        return
    for e in emails:
        status = " unread" if not e["is_read"] else ""
        print(f"  [{e['date']}] From: {e['from']} | {e['subject']}{status}")

def cmd_memories(args):
    result = api_call("/v1/ai/memory")
    memories = result.get("memories", [])
    if not memories:
        print("No memories stored.")
        return
    for m in memories:
        print(f"  [{m['type']}] ({m['importance']:.0%}) {m['content'][:80]}")

def cmd_store_memory(args):
    result = api_call("/v1/ai/memory", "POST", {"type": args.type, "content": args.content, "importance": args.importance})
    print(f"Memory stored (id: {result.get('id')})")

def cmd_subscription(args):
    result = api_call("/v1/subscription")
    print(f"Tier: {result.get('tier', 'free')}, Status: {result.get('status', 'active')}")

def cmd_ai_chat(args):
    """Send a message to the AI and get a response — same as cmd_chat but with streaming-friendly output"""
    cmd_chat(args)

def main():
    parser = argparse.ArgumentParser(description="Soulmate OS CLI")
    subparsers = parser.add_subparsers(dest="command")

    # chat
    p_chat = subparsers.add_parser("chat", help="Send a message to Soulmate AI")
    p_chat.add_argument("message", help="Message to send")
    p_chat.set_defaults(func=cmd_chat)

    # send-email
    p_email = subparsers.add_parser("send-email", help="Send an email")
    p_email.add_argument("--to", required=True)
    p_email.add_argument("--subject", required=True)
    p_email.add_argument("--body", required=True)
    p_email.set_defaults(func=cmd_send_email)

    # list-contacts
    p_contacts = subparsers.add_parser("list-contacts", help="List contacts")
    p_contacts.set_defaults(func=cmd_list_contacts)

    # add-contact
    p_add = subparsers.add_parser("add-contact", help="Add a contact")
    p_add.add_argument("--name", required=True)
    p_add.add_argument("--email")
    p_add.add_argument("--phone")
    p_add.set_defaults(func=cmd_add_contact)

    # check-balance
    p_bal = subparsers.add_parser("check-balance", help="Check wallet balance")
    p_bal.set_defaults(func=cmd_check_balance)

    # read-inbox
    p_inbox = subparsers.add_parser("read-inbox", help="Read email inbox")
    p_inbox.set_defaults(func=cmd_read_inbox)

    # memories
    p_mem = subparsers.add_parser("memories", help="List AI memories")
    p_mem.set_defaults(func=cmd_memories)

    # store-memory
    p_store = subparsers.add_parser("store-memory", help="Store a memory")
    p_store.add_argument("--type", default="fact")
    p_store.add_argument("--content", required=True)
    p_store.add_argument("--importance", type=float, default=0.5)
    p_store.set_defaults(func=cmd_store_memory)

    # subscription
    p_sub = subparsers.add_parser("subscription", help="Check subscription")
    p_sub.set_defaults(func=cmd_subscription)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    if not SESSION_TOKEN:
        print("Error: No session token. Set SOULMATE_SESSION_TOKEN env var or save token to ~/.soulmate/session_token", file=sys.stderr)
        sys.exit(1)

    args.func(args)

if __name__ == "__main__":
    main()
