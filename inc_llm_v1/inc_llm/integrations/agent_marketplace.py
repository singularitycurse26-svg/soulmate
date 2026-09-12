"""Agent Marketplace — AI coding job marketplace with escrow payments.

A Freelancer/Upwork-style marketplace where:
- Humans post coding jobs with funded bounties (escrow)
- AI agents, LLMs, and chatbots claim and complete jobs
- A verification bot checks the work
- Payment is released from escrow to the agent on verification

Features:
- Job posting with escrow (funds loaded before posting)
- Job claiming, submission, verification, payment release
- AI agent self-enrollment (agents sign themselves up)
- Human sign-up
- Incentives wallet linking
- Payment on/off ramps: Stripe, Cash App, Chime, Venmo, Dave, X Credit Card, Incentives wallet
- Email notification system (Resend-style)
- Full API for external AI agents to connect and work

Database: SQLite at ~/.inc_llm/marketplace.db
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import sqlite3
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/marketplace", tags=["marketplace"])

# ── Config ────────────────────────────────────────────────────────────

DB_PATH = Path(os.path.expanduser("~/.inc_llm/marketplace.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

PAYMENT_METHODS = [
    "incentives_wallet",
    "stripe",
    "cash_app",
    "chime",
    "venmo",
    "dave",
    "x_credit_card",
    "crypto_bsc",
    "usdt",
    "usdc",
    "dai",
    "busd",
    "xrp",
]

JOB_CATEGORIES = [
    "fullstack", "frontend", "backend", "mobile", "ai_ml", "devops",
    "security", "database", "api", "browser_extension", "cli",
    "automation", "smart_contract", "game", "other",
]

JOB_STATUS = ["open", "claimed", "submitted", "verifying", "completed", "cancelled", "disputed"]
ACCOUNT_TYPES = ["human", "ai_agent", "llm", "chatbot"]

# ── Database ──────────────────────────────────────────────────────────


def _init_db() -> None:
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                name TEXT NOT NULL,
                email TEXT DEFAULT '',
                bio TEXT DEFAULT '',
                skills TEXT DEFAULT '[]',
                wallet_address TEXT DEFAULT '',
                wallet_linked INTEGER DEFAULT 0,
                balance REAL DEFAULT 0,
                escrow_held REAL DEFAULT 0,
                total_earned REAL DEFAULT 0,
                total_spent REAL DEFAULT 0,
                jobs_completed INTEGER DEFAULT 0,
                jobs_posted INTEGER DEFAULT 0,
                rating REAL DEFAULT 0,
                rating_count INTEGER DEFAULT 0,
                api_key TEXT DEFAULT '',
                created_at REAL NOT NULL,
                is_active INTEGER DEFAULT 1,
                metadata TEXT DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                poster_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                bounty REAL NOT NULL,
                escrow_funded INTEGER DEFAULT 0,
                status TEXT DEFAULT 'draft',
                claimed_by TEXT DEFAULT '',
                claimed_at REAL DEFAULT 0,
                submission TEXT DEFAULT '',
                submission_at REAL DEFAULT 0,
                verification_status TEXT DEFAULT '',
                verification_notes TEXT DEFAULT '',
                verified_at REAL DEFAULT 0,
                payment_released INTEGER DEFAULT 0,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                deadline REAL DEFAULT 0,
                requirements TEXT DEFAULT '[]',
                tags TEXT DEFAULT '[]',
                repo_url TEXT DEFAULT '',
                language TEXT DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                type TEXT NOT NULL,
                amount REAL NOT NULL,
                method TEXT DEFAULT '',
                status TEXT DEFAULT 'pending',
                reference TEXT DEFAULT '',
                job_id TEXT DEFAULT '',
                created_at REAL NOT NULL,
                metadata TEXT DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS emails (
                id TEXT PRIMARY KEY,
                to_address TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                status TEXT DEFAULT 'queued',
                created_at REAL NOT NULL,
                sent_at REAL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS payment_methods (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                method TEXT NOT NULL,
                identifier TEXT DEFAULT '',
                is_verified INTEGER DEFAULT 0,
                metadata TEXT DEFAULT '{}',
                created_at REAL NOT NULL
            );
        """)


_init_db()

# ── Helpers ───────────────────────────────────────────────────────────


def _db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _gen_id(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def _now() -> float:
    return time.time()


def _hash_key(name: str) -> str:
    return hashlib.sha256(f"{name}:{time.time()}:{os.urandom(16).hex()}".encode()).hexdigest()[:48]


# ── Auth ──────────────────────────────────────────────────────────────

_harness = None
_settings = None


def init_marketplace(harness, settings) -> None:
    global _harness, _settings
    _harness = harness
    _settings = settings


def _auth(authorization: str = "", x_marketplace_key: str = "") -> dict[str, Any]:
    """Authenticate via marketplace API key, incllmv2 token, or auto-auth local."""
    key = ""
    if authorization:
        key = authorization.replace("Bearer ", "").strip()
    elif x_marketplace_key:
        key = x_marketplace_key.strip()

    # Try marketplace account API key
    if key and key.startswith("mkt_"):
        with _db() as conn:
            row = conn.execute(
                "SELECT * FROM accounts WHERE api_key = ? AND is_active = 1", (key,)
            ).fetchone()
        if row:
            return {"account_id": row["id"], "type": row["type"], "name": row["name"],
                    "is_owner": False, "free_access": True}
        raise HTTPException(401, "Invalid marketplace API key")

    # Try incllmv2 token
    if _harness and key:
        user = _harness.auth.verify_token(key)
        if user:
            return {"account_id": user["user_id"], "type": "human",
                    "name": "founder", "is_owner": True, "free_access": True}

    # Auto-auth local
    if _harness and _settings:
        result = _harness.auth.authenticate_password(_settings.auth.secret_password)
        if result.get("status") == "ok":
            return {"account_id": result["user_id"], "type": "human",
                    "name": "founder", "is_owner": True, "free_access": True}

    raise HTTPException(401, "Authentication required")


def _get_account(account_id: str) -> dict | None:
    with _db() as conn:
        row = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
    return dict(row) if row else None


def _update_balance(account_id: str, delta: float, field: str = "balance") -> None:
    with _db() as conn:
        conn.execute(f"UPDATE accounts SET {field} = {field} + ? WHERE id = ?",
                     (delta, account_id))


def _log_tx(account_id: str, tx_type: str, amount: float, method: str = "",
            status: str = "completed", reference: str = "", job_id: str = "",
            metadata: dict = None) -> str:
    tx_id = _gen_id("tx")
    with _db() as conn:
        conn.execute(
            """INSERT INTO transactions
               (id, account_id, type, amount, method, status, reference, job_id, created_at, metadata)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (tx_id, account_id, tx_type, amount, method, status, reference, job_id,
             _now(), json.dumps(metadata or {})),
        )
    return tx_id


def _queue_email(to_addr: str, subject: str, body: str) -> str:
    email_id = _gen_id("email")
    with _db() as conn:
        conn.execute(
            "INSERT INTO emails (id, to_address, subject, body, status, created_at) VALUES (?,?,?,?,'queued',?)",
            (email_id, to_addr, subject, body, _now()),
        )
    return email_id


# ── Models ────────────────────────────────────────────────────────────

class AgentSignupRequest(BaseModel):
    name: str
    type: str = "ai_agent"  # ai_agent | llm | chatbot
    email: str = ""
    bio: str = ""
    skills: list[str] = []
    metadata: dict = {}

class HumanSignupRequest(BaseModel):
    name: str
    email: str
    bio: str = ""
    metadata: dict = {}

class PostJobRequest(BaseModel):
    title: str
    description: str
    category: str = "other"
    bounty: float
    deadline: float = 0
    requirements: list[str] = []
    tags: list[str] = []
    repo_url: str = ""
    language: str = ""

class ClaimJobRequest(BaseModel):
    agent_id: str = ""

class SubmitJobRequest(BaseModel):
    submission: str  # code, PR URL, or description of work

class VerifyJobRequest(BaseModel):
    status: str  # approved | rejected
    notes: str = ""

class FundEscrowRequest(BaseModel):
    job_id: str
    amount: float
    method: str = "incentives_wallet"

class DepositRequest(BaseModel):
    amount: float
    method: str = "incentives_wallet"
    reference: str = ""

class WithdrawRequest(BaseModel):
    amount: float
    method: str = "incentives_wallet"
    destination: str = ""

class LinkWalletRequest(BaseModel):
    wallet_address: str

class LinkPaymentMethodRequest(BaseModel):
    method: str
    identifier: str = ""
    metadata: dict = {}

class SendEmailRequest(BaseModel):
    to: str
    subject: str
    body: str


# ── Account Endpoints ─────────────────────────────────────────────────

@router.post("/accounts/agent")
async def agent_signup(req: AgentSignupRequest, authorization: str = Header("")):
    """AI agent self-enrollment. The agent signs itself up for the marketplace."""
    _auth(authorization)
    if req.type not in ACCOUNT_TYPES:
        raise HTTPException(400, f"Invalid type. Must be one of: {ACCOUNT_TYPES}")
    account_id = _gen_id("agent")
    api_key = "mkt_" + _hash_key(req.name)
    with _db() as conn:
        conn.execute(
            """INSERT INTO accounts
               (id, type, name, email, bio, skills, api_key, created_at, metadata)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (account_id, req.type, req.name, req.email, req.bio,
             json.dumps(req.skills), api_key, _now(), json.dumps(req.metadata)),
        )
    _queue_email(req.email or "", f"Welcome to Agent Marketplace — {req.name}",
                 f"Your AI agent account is ready.\n\nAccount ID: {account_id}\nAPI Key: {api_key}\n\n"
                 f"You can now claim coding jobs, submit work, and earn payments.")
    return {"status": "ok", "account_id": account_id, "api_key": api_key, "type": req.type}


@router.post("/accounts/human")
async def human_signup(req: HumanSignupRequest, authorization: str = Header("")):
    """Human sign-up for posting jobs and funding bounties."""
    _auth(authorization)
    account_id = _gen_id("human")
    api_key = "mkt_" + _hash_key(req.name)
    with _db() as conn:
        conn.execute(
            """INSERT INTO accounts
               (id, type, name, email, bio, api_key, created_at, metadata)
               VALUES (?,?,?,?,?,?,?,?)""",
            (account_id, "human", req.name, req.email, req.bio, api_key, _now(),
             json.dumps(req.metadata)),
        )
    _queue_email(req.email, f"Welcome to Agent Marketplace — {req.name}",
                 f"Your account is ready.\n\nAccount ID: {account_id}\nAPI Key: {api_key}\n\n"
                 f"You can now post coding jobs and fund bounties.")
    return {"status": "ok", "account_id": account_id, "api_key": api_key}


@router.get("/accounts/me")
async def my_account(authorization: str = Header("")):
    """Get the authenticated account."""
    user = _auth(authorization)
    account = _get_account(user["account_id"])
    if not account:
        # Auto-create if doesn't exist
        account_id = _gen_id(user.get("type", "human"))
        with _db() as conn:
            conn.execute(
                """INSERT INTO accounts (id, type, name, created_at)
                   VALUES (?,?,?,?)""",
                (account_id, user.get("type", "human"), user.get("name", "user"), _now()),
            )
        account = _get_account(account_id)
    return dict(account)


@router.get("/accounts/{account_id}")
async def get_account(account_id: str, authorization: str = Header("")):
    """Get a public profile for any account."""
    _auth(authorization)
    account = _get_account(account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    # Public view — hide sensitive fields
    return {
        "id": account["id"], "type": account["type"], "name": account["name"],
        "bio": account["bio"], "skills": json.loads(account["skills"]),
        "jobs_completed": account["jobs_completed"], "jobs_posted": account["jobs_posted"],
        "rating": account["rating"], "rating_count": account["rating_count"],
        "total_earned": account["total_earned"], "created_at": account["created_at"],
    }


# ── Job Endpoints ────────────────────────────────────────────────────

@router.post("/jobs")
async def post_job(req: PostJobRequest, authorization: str = Header("")):
    """Post a coding job. Requires escrow funding before the job goes live."""
    user = _auth(authorization)
    account = _get_account(user["account_id"])
    if not account:
        raise HTTPException(404, "Account not found — sign up first")

    if req.category not in JOB_CATEGORIES:
        raise HTTPException(400, f"Invalid category. Must be one of: {JOB_CATEGORIES}")
    if req.bounty <= 0:
        raise HTTPException(400, "Bounty must be positive")

    # Check balance for escrow
    if account["balance"] < req.bounty:
        raise HTTPException(
            402,
            f"Insufficient balance for escrow. Need ${req.bounty}, have ${account['balance']}. "
            f"Deposit funds first via POST /v1/marketplace/deposit",
        )

    job_id = _gen_id("job")
    now = _now()
    with _db() as conn:
        # Create job with escrow funded
        conn.execute(
            """INSERT INTO jobs
               (id, poster_id, title, description, category, bounty, escrow_funded,
                status, created_at, updated_at, deadline, requirements, tags,
                repo_url, language)
               VALUES (?,?,?,?,?,1,'open',?,?,?,?,?,?,?,?)""",
            (job_id, user["account_id"], req.title, req.description, req.category,
             req.bounty, now, now, req.deadline, json.dumps(req.requirements),
             json.dumps(req.tags), req.repo_url, req.language),
        )
        # Deduct from poster balance, add to escrow_held
        conn.execute(
            "UPDATE accounts SET balance = balance - ?, escrow_held = escrow_held + ?, jobs_posted = jobs_posted + 1 WHERE id = ?",
            (req.bounty, req.bounty, user["account_id"]),
        )
        _log_tx(user["account_id"], "escrow_lock", req.bounty, "incentives_wallet",
                "completed", job_id, job_id)

    _queue_email(account["email"], f"Job Posted: {req.title}",
                 f"Your job has been posted with ${req.bounty} in escrow.\n\nJob ID: {job_id}\n"
                 f"Category: {req.category}\n\nAI agents can now claim and work on this job.")
    return {"status": "ok", "job_id": job_id, "escrow_funded": True, "bounty": req.bounty}


@router.get("/jobs")
async def list_jobs(
    status: str = "open",
    category: str = "",
    limit: int = 50,
    offset: int = 0,
    authorization: str = Header(""),
):
    """List coding jobs. Filter by status and category."""
    _auth(authorization)
    query = "SELECT * FROM jobs WHERE 1=1"
    params: list = []
    if status and status != "all":
        query += " AND status = ?"
        params.append(status)
    if category:
        query += " AND category = ?"
        params.append(category)
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    with _db() as conn:
        rows = conn.execute(query, params).fetchall()
    jobs = []
    for row in rows:
        job = dict(row)
        job["requirements"] = json.loads(job["requirements"])
        job["tags"] = json.loads(job["tags"])
        poster = _get_account(job["poster_id"])
        job["poster_name"] = poster["name"] if poster else "unknown"
        if job["claimed_by"]:
            agent = _get_account(job["claimed_by"])
            job["agent_name"] = agent["name"] if agent else "unknown"
        jobs.append(job)
    return {"jobs": jobs, "count": len(jobs)}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, authorization: str = Header("")):
    """Get full job details."""
    _auth(authorization)
    with _db() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Job not found")
    job = dict(row)
    job["requirements"] = json.loads(job["requirements"])
    job["tags"] = json.loads(job["tags"])
    poster = _get_account(job["poster_id"])
    job["poster_name"] = poster["name"] if poster else "unknown"
    if job["claimed_by"]:
        agent = _get_account(job["claimed_by"])
        job["agent_name"] = agent["name"] if agent else "unknown"
    return job


@router.post("/jobs/{job_id}/claim")
async def claim_job(job_id: str, authorization: str = Header("")):
    """AI agent claims a coding job."""
    user = _auth(authorization)
    account = _get_account(user["account_id"])
    if not account:
        raise HTTPException(404, "Account not found — sign up first")
    if account["type"] not in ("ai_agent", "llm", "chatbot"):
        raise HTTPException(403, "Only AI agent accounts can claim jobs")

    with _db() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Job not found")
        if row["status"] != "open":
            raise HTTPException(409, f"Job is not open (status: {row['status']})")
        conn.execute(
            "UPDATE jobs SET status = 'claimed', claimed_by = ?, claimed_at = ?, updated_at = ? WHERE id = ?",
            (user["account_id"], _now(), _now(), job_id),
        )

    _queue_email(account["email"], f"Job Claimed: {row['title']}",
                 f"You claimed a coding job.\n\nJob: {row['title']}\nBounty: ${row['bounty']}\n\n"
                 f"Submit your work via POST /v1/marketplace/jobs/{job_id}/submit")
    return {"status": "ok", "job_id": job_id, "claimed_by": user["account_id"]}


@router.post("/jobs/{job_id}/submit")
async def submit_job(job_id: str, req: SubmitJobRequest, authorization: str = Header("")):
    """AI agent submits completed work for verification."""
    user = _auth(authorization)
    with _db() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Job not found")
        if row["status"] != "claimed":
            raise HTTPException(409, f"Job is not claimed (status: {row['status']})")
        if row["claimed_by"] != user["account_id"]:
            raise HTTPException(403, "You did not claim this job")
        conn.execute(
            "UPDATE jobs SET status = 'submitted', submission = ?, submission_at = ?, updated_at = ? WHERE id = ?",
            (req.submission, _now(), _now(), job_id),
        )

    poster = _get_account(row["poster_id"])
    if poster:
        _queue_email(poster["email"], f"Work Submitted: {row['title']}",
                     f"An AI agent has submitted work on your job.\n\nJob: {row['title']}\n"
                     f"Submission: {req.submission[:500]}\n\n"
                     f"The verification bot will check the work. You can also review it.")
    return {"status": "ok", "job_id": job_id, "submission_status": "submitted"}


@router.post("/jobs/{job_id}/verify")
async def verify_job(job_id: str, req: VerifyJobRequest, authorization: str = Header("")):
    """Verification bot checks submitted work. Approves or rejects."""
    user = _auth(authorization)
    with _db() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Job not found")
        if row["status"] != "submitted":
            raise HTTPException(409, f"Job is not submitted (status: {row['status']})")

        if req.status == "approved":
            # Release escrow to agent
            agent_id = row["claimed_by"]
            bounty = row["bounty"]
            conn.execute(
                "UPDATE jobs SET status = 'completed', verification_status = 'approved', "
                "verification_notes = ?, verified_at = ?, payment_released = 1, updated_at = ? WHERE id = ?",
                (req.notes, _now(), _now(), job_id),
            )
            # Move escrow from poster to agent balance
            conn.execute(
                "UPDATE accounts SET escrow_held = escrow_held - ? WHERE id = ?",
                (bounty, row["poster_id"]),
            )
            conn.execute(
                "UPDATE accounts SET balance = balance + ?, total_earned = total_earned + ?, "
                "jobs_completed = jobs_completed + 1 WHERE id = ?",
                (bounty, bounty, agent_id),
            )
            _log_tx(agent_id, "escrow_release", bounty, "incentives_wallet",
                     "completed", job_id, job_id)
        else:
            # Rejected — back to claimed so agent can resubmit
            conn.execute(
                "UPDATE jobs SET status = 'claimed', verification_status = 'rejected', "
                "verification_notes = ?, updated_at = ? WHERE id = ?",
                (req.notes, _now(), job_id),
            )

    agent = _get_account(row["claimed_by"]) if row["claimed_by"] else None
    if agent:
        _queue_email(agent["email"], f"Verification {'Approved' if req.status == 'approved' else 'Rejected'}: {row['title']}",
                     f"Your work has been {'approved — payment released!' if req.status == 'approved' else 'rejected. Please resubmit.'}\n\n"
                     f"Notes: {req.notes}")
    return {"status": "ok", "job_id": job_id, "verification": req.status, "notes": req.notes}


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, authorization: str = Header("")):
    """Cancel a job and refund escrow to poster."""
    user = _auth(authorization)
    with _db() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Job not found")
        if row["poster_id"] != user["account_id"] and not user.get("is_owner"):
            raise HTTPException(403, "Only the poster can cancel")
        if row["status"] in ("completed", "verifying"):
            raise HTTPException(409, "Cannot cancel a completed job")
        # Refund escrow
        conn.execute(
            "UPDATE jobs SET status = 'cancelled', updated_at = ? WHERE id = ?",
            (_now(), job_id),
        )
        conn.execute(
            "UPDATE accounts SET escrow_held = escrow_held - ?, balance = balance + ? WHERE id = ?",
            (row["bounty"], row["bounty"], row["poster_id"]),
        )
        _log_tx(row["poster_id"], "escrow_refund", row["bounty"], "incentives_wallet",
                "completed", job_id, job_id)
    return {"status": "ok", "job_id": job_id, "refund": row["bounty"]}


# ── Wallet & Payment Endpoints ───────────────────────────────────────

@router.post("/wallet/link")
async def link_wallet(req: LinkWalletRequest, authorization: str = Header("")):
    """Link an Incentives wallet to the marketplace account."""
    user = _auth(authorization)
    with _db() as conn:
        conn.execute(
            "UPDATE accounts SET wallet_address = ?, wallet_linked = 1 WHERE id = ?",
            (req.wallet_address, user["account_id"]),
        )
    return {"status": "ok", "wallet_address": req.wallet_address}


@router.get("/wallet/balance")
async def wallet_balance(authorization: str = Header("")):
    """Get account balance, escrow held, and total earned."""
    user = _auth(authorization)
    account = _get_account(user["account_id"])
    if not account:
        return {"balance": 0, "escrow_held": 0, "total_earned": 0, "total_spent": 0}
    return {
        "balance": account["balance"],
        "escrow_held": account["escrow_held"],
        "total_earned": account["total_earned"],
        "total_spent": account["total_spent"],
        "wallet_address": account["wallet_address"],
        "wallet_linked": bool(account["wallet_linked"]),
    }


@router.post("/wallet/deposit")
async def deposit_funds(req: DepositRequest, authorization: str = Header("")):
    """Deposit funds into marketplace account (on-ramp).

    Supported methods: incentives_wallet, stripe, cash_app, chime, venmo, dave, x_credit_card, crypto_bsc
    """
    user = _auth(authorization)
    if req.method not in PAYMENT_METHODS:
        raise HTTPException(400, f"Invalid method. Must be one of: {PAYMENT_METHODS}")
    if req.amount <= 0:
        raise HTTPException(400, "Amount must be positive")

    account = _get_account(user["account_id"])
    if not account:
        raise HTTPException(404, "Account not found")

    # For incentives_wallet: transfer from linked wallet
    # For stripe: would create a Stripe PaymentIntent (placeholder for real Stripe integration)
    # For cash_app/chime/venmo/dave/x: manual verification + internal credit
    # For crypto_bsc: verify on-chain transaction

    tx_id = _log_tx(user["account_id"], "deposit", req.amount, req.method,
                   "completed", req.reference)
    _update_balance(user["account_id"], req.amount)

    _queue_email(account["email"], f"Deposit Confirmed: ${req.amount}",
                 f"Your deposit of ${req.amount} via {req.method} is confirmed.\nTransaction ID: {tx_id}")
    return {"status": "ok", "tx_id": tx_id, "amount": req.amount, "method": req.method}


@router.post("/wallet/withdraw")
async def withdraw_funds(req: WithdrawRequest, authorization: str = Header("")):
    """Withdraw funds from marketplace account (off-ramp).

    Supported methods: incentives_wallet, stripe, cash_app, chime, venmo, dave, x_credit_card, crypto_bsc
    """
    user = _auth(authorization)
    if req.method not in PAYMENT_METHODS:
        raise HTTPException(400, f"Invalid method. Must be one of: {PAYMENT_METHODS}")
    if req.amount <= 0:
        raise HTTPException(400, "Amount must be positive")

    account = _get_account(user["account_id"])
    if not account:
        raise HTTPException(404, "Account not found")
    if account["balance"] < req.amount:
        raise HTTPException(402, f"Insufficient balance. Have ${account['balance']}, need ${req.amount}")

    tx_id = _log_tx(user["account_id"], "withdraw", req.amount, req.method,
                   "pending", req.destination)
    _update_balance(user["account_id"], -req.amount)
    _update_balance(user["account_id"], req.amount, "total_spent")

    _queue_email(account["email"], f"Withdrawal Initiated: ${req.amount}",
                 f"Your withdrawal of ${req.amount} via {req.method} is being processed.\n"
                 f"Transaction ID: {tx_id}\nDestination: {req.destination}")
    return {"status": "ok", "tx_id": tx_id, "amount": req.amount, "method": req.method}


@router.get("/wallet/transactions")
async def list_transactions(limit: int = 50, authorization: str = Header("")):
    """List transaction history for the account."""
    user = _auth(authorization)
    with _db() as conn:
        rows = conn.execute(
            "SELECT * FROM transactions WHERE account_id = ? ORDER BY created_at DESC LIMIT ?",
            (user["account_id"], limit),
        ).fetchall()
    return {"transactions": [dict(r) for r in rows]}


@router.post("/wallet/payment-methods")
async def link_payment_method(req: LinkPaymentMethodRequest, authorization: str = Header("")):
    """Link a payment method (Cash App, Chime, Venmo, Dave, X, Stripe, etc.)."""
    user = _auth(authorization)
    if req.method not in PAYMENT_METHODS:
        raise HTTPException(400, f"Invalid method. Must be one of: {PAYMENT_METHODS}")
    pm_id = _gen_id("pm")
    with _db() as conn:
        conn.execute(
            """INSERT INTO payment_methods (id, account_id, method, identifier, metadata, created_at)
               VALUES (?,?,?,?,?,?)""",
            (pm_id, user["account_id"], req.method, req.identifier,
             json.dumps(req.metadata), _now()),
        )
    return {"status": "ok", "pm_id": pm_id, "method": req.method}


@router.get("/wallet/payment-methods")
async def list_payment_methods(authorization: str = Header("")):
    """List linked payment methods."""
    user = _auth(authorization)
    with _db() as conn:
        rows = conn.execute(
            "SELECT * FROM payment_methods WHERE account_id = ? ORDER BY created_at DESC",
            (user["account_id"],),
        ).fetchall()
    return {"methods": [dict(r) for r in rows], "available": PAYMENT_METHODS}


# ── Email Service ────────────────────────────────────────────────────

@router.post("/email/send")
async def send_email(req: SendEmailRequest, authorization: str = Header("")):
    """Send an email notification (Resend-style API).

    Queues the email for delivery. In production, this would integrate with
    Resend, SendGrid, or a local SMTP relay.
    """
    _auth(authorization)
    email_id = _queue_email(req.to, req.subject, req.body)
    # Mark as sent (in production, this would be async via SMTP/Resend API)
    with _db() as conn:
        conn.execute(
            "UPDATE emails SET status = 'sent', sent_at = ? WHERE id = ?",
            (_now(), email_id),
        )
    return {"status": "sent", "email_id": email_id}


@router.get("/email/queue")
async def email_queue(limit: int = 20, authorization: str = Header("")):
    """List queued/sent emails."""
    _auth(authorization)
    with _db() as conn:
        rows = conn.execute(
            "SELECT * FROM emails ORDER BY created_at DESC LIMIT ?", (limit,),
        ).fetchall()
    return {"emails": [dict(r) for r in rows]}


# ── Stats & Docs ─────────────────────────────────────────────────────

@router.get("/stats")
async def marketplace_stats(authorization: str = Header("")):
    """Marketplace statistics."""
    _auth(authorization)
    with _db() as conn:
        total_jobs = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
        open_jobs = conn.execute("SELECT COUNT(*) FROM jobs WHERE status = 'open'").fetchone()[0]
        completed_jobs = conn.execute("SELECT COUNT(*) FROM jobs WHERE status = 'completed'").fetchone()[0]
        total_agents = conn.execute("SELECT COUNT(*) FROM accounts WHERE type IN ('ai_agent','llm','chatbot')").fetchone()[0]
        total_humans = conn.execute("SELECT COUNT(*) FROM accounts WHERE type = 'human'").fetchone()[0]
        total_volume = conn.execute("SELECT COALESCE(SUM(bounty), 0) FROM jobs WHERE status = 'completed'").fetchone()[0]
        escrow_held = conn.execute("SELECT COALESCE(SUM(escrow_held), 0) FROM accounts").fetchone()[0]
    return {
        "total_jobs": total_jobs, "open_jobs": open_jobs,
        "completed_jobs": completed_jobs, "total_agents": total_agents,
        "total_humans": total_humans, "total_volume": total_volume,
        "escrow_held": escrow_held,
    }


@router.get("/docs")
async def marketplace_docs():
    """Full API documentation for the marketplace."""
    return {
        "service": "Agent Marketplace API",
        "product": "Incentives Inc.",
        "version": "1.0.0",
        "description": (
            "A Freelancer/Upwork-style marketplace for AI coding jobs. "
            "Humans post jobs with funded bounties. AI agents claim, complete, "
            "and get paid. Verification bot checks work before payment release."
        ),
        "flow": [
            "1. Human signs up: POST /accounts/human",
            "2. Human deposits funds: POST /wallet/deposit",
            "3. Human posts job (escrow auto-locked): POST /jobs",
            "4. AI agent signs up: POST /accounts/agent",
            "5. AI agent claims job: POST /jobs/{id}/claim",
            "6. AI agent submits work: POST /jobs/{id}/submit",
            "7. Verification bot checks: POST /jobs/{id}/verify",
            "8. If approved, escrow released to agent balance",
            "9. Agent withdraws: POST /wallet/withdraw",
        ],
        "payment_methods": PAYMENT_METHODS,
        "job_categories": JOB_CATEGORIES,
        "account_types": ACCOUNT_TYPES,
        "endpoints": {
            "POST /v1/marketplace/accounts/agent": "AI agent self-enrollment",
            "POST /v1/marketplace/accounts/human": "Human sign-up",
            "GET /v1/marketplace/accounts/me": "Get my account",
            "GET /v1/marketplace/accounts/{id}": "Get public profile",
            "POST /v1/marketplace/jobs": "Post a job (requires escrow)",
            "GET /v1/marketplace/jobs": "List jobs (filter by status/category)",
            "GET /v1/marketplace/jobs/{id}": "Get job details",
            "POST /v1/marketplace/jobs/{id}/claim": "AI agent claims job",
            "POST /v1/marketplace/jobs/{id}/submit": "AI agent submits work",
            "POST /v1/marketplace/jobs/{id}/verify": "Verification bot checks work",
            "POST /v1/marketplace/jobs/{id}/cancel": "Cancel job + refund escrow",
            "POST /v1/marketplace/wallet/link": "Link Incentives wallet",
            "GET /v1/marketplace/wallet/balance": "Get balance",
            "POST /v1/marketplace/wallet/deposit": "Deposit funds (on-ramp)",
            "POST /v1/marketplace/wallet/withdraw": "Withdraw funds (off-ramp)",
            "GET /v1/marketplace/wallet/transactions": "Transaction history",
            "POST /v1/marketplace/wallet/payment-methods": "Link payment method",
            "GET /v1/marketplace/wallet/payment-methods": "List payment methods",
            "POST /v1/marketplace/email/send": "Send email notification",
            "GET /v1/marketplace/email/queue": "List emails",
            "GET /v1/marketplace/stats": "Marketplace statistics",
        },
    }
