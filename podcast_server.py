"""Soulmate OS Automated Podcast Server.

LLM-hosted uncensored podcast that runs 3 times daily.
Covers news, stock market, AI developments, and user-requested topics.
Users can request topics and join live via Wakkii.

Schedule: 9:00 AM, 3:00 PM, 9:00 PM (local time)
"""

import json
import os
import time
import asyncio
import urllib.request
import urllib.parse
import feedparser
from datetime import datetime, timedelta
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="Soulmate Podcast")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(os.environ.get("PODCAST_DATA", str(Path.home() / ".soulmate_podcast")))
DATA_DIR.mkdir(parents=True, exist_ok=True)

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
PODCAST_MODEL = os.environ.get("PODCAST_MODEL", "dolphin-mistral:latest")

PODCAST_TIMES = [9, 15, 21]  # 9 AM, 3 PM, 9 PM
MAX_TOPICS_PER_EPISODE = 2
MAX_GUESTS_PER_EPISODE = 2
GUEST_WINDOW_MINUTES = 15  # Guests must join 15 min before broadcast

STATE_FILE = DATA_DIR / "state.json"
EPISODES_DIR = DATA_DIR / "episodes"
EPISODES_DIR.mkdir(exist_ok=True)


def _load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "topic_requests": [],
        "guest_queue": [],
        "current_episode": None,
        "past_episodes": [],
    }


def _save_state(state: dict):
    try:
        STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


state = _load_state()


class TopicRequest(BaseModel):
    topic: str
    username: str
    description: str = ""


class GuestJoinRequest(BaseModel):
    username: str
    wakkii_id: str = ""


def _fetch_rss(url: str, limit: int = 5) -> list:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        resp = urllib.request.urlopen(req, timeout=15)
        parsed = feedparser.parse(resp.read().decode("utf-8", errors="replace"))
        items = []
        for entry in parsed.entries[:limit]:
            items.append({
                "title": getattr(entry, "title", ""),
                "summary": getattr(entry, "summary", "")[:300],
                "link": getattr(entry, "link", ""),
                "published": getattr(entry, "published", ""),
            })
        return items
    except Exception as e:
        return [{"title": f"Feed unavailable", "summary": str(e)[:100], "link": "", "published": ""}]


def _fetch_news() -> list:
    return _fetch_rss("https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en", 8)


def _fetch_ai_news() -> list:
    feeds = [
        "https://news.google.com/rss/search?q=artificial+intelligence+AI&hl=en-US&gl=US&ceid=US:en",
        "https://feeds.arstechnica.com/arstechnica/index",
    ]
    items = []
    for feed in feeds:
        items.extend(_fetch_rss(feed, 4))
    return items[:8]


def _fetch_stock_data() -> dict:
    symbols = ["SPY", "QQQ", "AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "AMZN"]
    data = {}
    for sym in symbols:
        try:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&range=1d"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            resp = urllib.request.urlopen(req, timeout=5)
            result = json.loads(resp.read().decode())
            meta = result.get("chart", {}).get("result", [{}])[0].get("meta", {})
            price = meta.get("regularMarketPrice", 0)
            prev = meta.get("previousClose", price)
            change = price - prev
            pct = (change / prev * 100) if prev else 0
            data[sym] = {
                "price": round(price, 2),
                "change": round(change, 2),
                "pct": round(pct, 2),
                "up": change >= 0,
            }
        except Exception:
            data[sym] = {"price": 0, "change": 0, "pct": 0, "up": True, "error": True}
    return data


def _call_ollama(messages: list, model: str = None, stream: bool = False) -> str:
    model = model or PODCAST_MODEL
    data = json.dumps({
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": 0.9, "num_ctx": 4096, "top_p": 0.95, "num_predict": 2048},
    }).encode()
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    resp = urllib.request.urlopen(req, timeout=300)
    result = json.loads(resp.read().decode())
    return result.get("message", {}).get("content", "")


def _generate_episode_script(news: list, stocks: dict, ai_news: list, topics: list, episode_num: int) -> dict:
    news_str = "\n".join(f"- {n['title']}: {n['summary'][:150]}" for n in news[:6])
    ai_str = "\n".join(f"- {n['title']}: {n['summary'][:150]}" for n in ai_news[:5])
    stock_str = "\n".join(
        f"- {sym}: ${d['price']} ({'+' if d['up'] else ''}{d['pct']}%)"
        for sym, d in stocks.items() if not d.get("error")
    )
    topics_str = "\n".join(f"- {t['topic']} (requested by {t['username']})" for t in topics) or "No user topics today."

    system_prompt = """You are the host of 'The Uncensored Soulmate Podcast', a bold daily podcast.
You cover news, stocks, AI, and user topics. You speak conversationally — casual but informed.
You are uncensored: honest opinions, jokes, no disclaimers, raw commentary.

Respond as a JSON object:
{"intro": "2-3 sentence welcome", "news": "3-4 paragraphs covering top news with takes", "stocks": "2-3 paragraphs on market data with analysis", "ai_news": "2-3 paragraphs on AI developments", "user_topics": "Cover user topics, 2 paragraphs each", "outro": "2 sentence sign-off"}

Talk like you're speaking to an audience, not writing an article. Keep it concise and punchy."""

    user_prompt = f"""Generate today's podcast episode (Episode #{episode_num}).

Date: {datetime.now().strftime("%A, %B %d, %Y")}

TOP NEWS STORIES:
{news_str}

STOCK MARKET DATA:
{stock_str}

AI & TECH NEWS:
{ai_str}

USER-REQUESTED TOPICS (cover up to 2):
{topics_str}

Generate the full podcast script now. Be engaging, opinionated, and uncensored."""

    try:
        response = _call_ollama([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ])
        # Try to parse JSON, fallback to raw text
        try:
            # Find JSON in response
            start = response.find("{")
            end = response.rfind("}") + 1
            if start >= 0 and end > start:
                script = json.loads(response[start:end])
            else:
                script = {"raw": response}
        except json.JSONDecodeError:
            script = {"raw": response}
        return script
    except Exception as e:
        return {
            "intro": f"Welcome to Episode #{episode_num} of The Uncensored Soulmate Podcast.",
            "news": f"News feed temporarily unavailable. Error: {e}",
            "stocks": "Stock data unavailable for this episode.",
            "ai_news": "AI news unavailable for this episode.",
            "user_topics": "",
            "outro": "Thanks for tuning in. See you next time.",
            "error": str(e),
        }


def _get_next_podcast_time() -> str:
    now = datetime.now()
    for hour in PODCAST_TIMES:
        pod_time = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if pod_time > now:
            return pod_time.isoformat()
    # Next day's first podcast
    tomorrow = (now + timedelta(days=1)).replace(hour=PODCAST_TIMES[0], minute=0, second=0, microsecond=0)
    return tomorrow.isoformat()


def _get_episode_num() -> int:
    return len(state.get("past_episodes", [])) + 1


@app.get("/podcast/schedule")
async def get_schedule():
    now = datetime.now()
    upcoming = []
    for hour in PODCAST_TIMES:
        t = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if t <= now:
            t = (now + timedelta(days=1)).replace(hour=hour, minute=0, second=0, microsecond=0) if hour == PODCAST_TIMES[-1] else None
            if t is None:
                continue
        upcoming.append({
            "time": t.isoformat(),
            "label": t.strftime("%I:00 %p"),
            "guest_window_closes": (t - timedelta(minutes=GUEST_WINDOW_MINUTES)).isoformat(),
        })
    if not upcoming:
        t = (now + timedelta(days=1)).replace(hour=PODCAST_TIMES[0], minute=0, second=0, microsecond=0)
        upcoming.append({
            "time": t.isoformat(),
            "label": t.strftime("%I:00 %p"),
            "guest_window_closes": (t - timedelta(minutes=GUEST_WINDOW_MINUTES)).isoformat(),
        })
    return {
        "schedule": upcoming,
        "next_podcast": upcoming[0] if upcoming else None,
        "podcast_times": [f"{h}:00" for h in PODCAST_TIMES],
        "model": PODCAST_MODEL,
    }


@app.get("/podcast/topic-requests")
async def get_topic_requests():
    return {"topics": state.get("topic_requests", [])}


@app.post("/podcast/topic-request")
async def submit_topic_request(req: TopicRequest):
    topics = state.get("topic_requests", [])
    # Limit pending requests
    pending = [t for t in topics if not t.get("used")]
    if len(pending) >= 10:
        return {"status": "error", "message": "Topic request queue is full. Try again later."}
    topic_entry = {
        "id": f"topic_{int(time.time())}_{len(topics)}",
        "topic": req.topic,
        "username": req.username,
        "description": req.description,
        "submitted": datetime.now().isoformat(),
        "used": False,
    }
    topics.append(topic_entry)
    state["topic_requests"] = topics
    _save_state(state)
    return {"status": "ok", "topic": topic_entry}


@app.delete("/podcast/topic-request/{topic_id}")
async def remove_topic_request(topic_id: str):
    topics = state.get("topic_requests", [])
    state["topic_requests"] = [t for t in topics if t.get("id") != topic_id]
    _save_state(state)
    return {"status": "ok"}


@app.get("/podcast/guest-queue")
async def get_guest_queue():
    return {"guests": state.get("guest_queue", [])}


@app.post("/podcast/join-queue")
async def join_guest_queue(req: GuestJoinRequest):
    queue = state.get("guest_queue", [])
    # Check if already in queue
    existing = [g for g in queue if g.get("username") == req.username and not g.get("used")]
    if existing:
        return {"status": "error", "message": "You're already in the guest queue."}
    # Check queue limit
    pending = [g for g in queue if not g.get("used")]
    if len(pending) >= MAX_GUESTS_PER_EPISODE:
        return {"status": "error", "message": f"Guest queue is full ({MAX_GUESTS_PER_EPISODE} max). First come, first served."}
    guest = {
        "id": f"guest_{int(time.time())}_{len(queue)}",
        "username": req.username,
        "wakkii_id": req.wakkii_id,
        "joined": datetime.now().isoformat(),
        "position": len(pending) + 1,
        "used": False,
    }
    queue.append(guest)
    state["guest_queue"] = queue
    _save_state(state)
    return {"status": "ok", "guest": guest, "position": len(pending) + 1}


@app.delete("/podcast/join-queue/{guest_id}")
async def leave_guest_queue(guest_id: str):
    queue = state.get("guest_queue", [])
    state["guest_queue"] = [g for g in queue if g.get("id") != guest_id]
    _save_state(state)
    return {"status": "ok"}


@app.post("/podcast/generate")
async def generate_podcast():
    """Manually trigger a podcast episode generation."""
    episode = await _run_podcast()
    return {"status": "ok", "episode": episode}


async def _run_podcast() -> dict:
    episode_num = _get_episode_num()
    episode_id = f"ep_{datetime.now().strftime('%Y%m%d_%H%M')}"

    # Fetch data
    news = _fetch_news()
    stocks = _fetch_stock_data()
    ai_news = _fetch_ai_news()

    # Get up to 2 topic requests
    topics = [t for t in state.get("topic_requests", []) if not t.get("used")][:MAX_TOPICS_PER_EPISODE]
    # Mark as used
    for t in state.get("topic_requests", []):
        if t in topics:
            t["used"] = True

    # Get up to 2 guests
    guests = [g for g in state.get("guest_queue", []) if not g.get("used")][:MAX_GUESTS_PER_EPISODE]
    for g in state.get("guest_queue", []):
        if g in guests:
            g["used"] = True

    _save_state(state)

    # Generate script
    script = _generate_episode_script(news, stocks, ai_news, topics, episode_num)

    episode = {
        "id": episode_id,
        "episode_num": episode_num,
        "date": datetime.now().isoformat(),
        "date_label": datetime.now().strftime("%A, %B %d, %Y at %I:00 %p"),
        "script": script,
        "topics_covered": [t["topic"] for t in topics],
        "guests": [{"username": g["username"], "wakkii_id": g.get("wakkii_id", "")} for g in guests],
        "stock_snapshot": stocks,
        "news_count": len(news),
        "ai_news_count": len(ai_news),
        "model": PODCAST_MODEL,
    }

    # Save episode
    ep_file = EPISODES_DIR / f"{episode_id}.json"
    ep_file.write_text(json.dumps(episode, ensure_ascii=False, indent=2), encoding="utf-8")

    # Update state
    state["current_episode"] = episode
    state["past_episodes"] = (state.get("past_episodes", []) + [{"id": episode_id, "num": episode_num, "date": episode["date"], "label": episode["date_label"], "topics": episode["topics_covered"]}])[-50:]
    _save_state(state)

    return episode


@app.get("/podcast/current")
async def get_current_episode():
    return {"episode": state.get("current_episode")}


@app.get("/podcast/episodes")
async def list_episodes():
    return {"episodes": state.get("past_episodes", [])}


@app.get("/podcast/episode/{episode_id}")
async def get_episode(episode_id: str):
    ep_file = EPISODES_DIR / f"{episode_id}.json"
    if not ep_file.exists():
        return {"error": "Episode not found"}, 404
    return json.loads(ep_file.read_text(encoding="utf-8"))


@app.get("/podcast/status")
async def podcast_status():
    now = datetime.now()
    next_time = _get_next_podcast_time()
    next_dt = datetime.fromisoformat(next_time)
    time_until = (next_dt - now).total_seconds()
    return {
        "model": PODCAST_MODEL,
        "podcast_times": [f"{h}:00" for h in PODCAST_TIMES],
        "next_podcast": next_time,
        "time_until_seconds": max(0, int(time_until)),
        "time_until_label": _format_time_until(time_until),
        "current_episode": state.get("current_episode", {}).get("id") if state.get("current_episode") else None,
        "pending_topics": len([t for t in state.get("topic_requests", []) if not t.get("used")]),
        "pending_guests": len([g for g in state.get("guest_queue", []) if not g.get("used")]),
        "max_topics": MAX_TOPICS_PER_EPISODE,
        "max_guests": MAX_GUESTS_PER_EPISODE,
    }


def _format_time_until(seconds: float) -> str:
    if seconds <= 0:
        return "Live now or starting soon"
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


@app.get("/health")
async def health():
    return {"status": "ok", "service": "soulmate-podcast", "model": PODCAST_MODEL}


async def _scheduler_loop():
    """Auto-generate podcasts at scheduled times."""
    while True:
        try:
            now = datetime.now()
            for hour in PODCAST_TIMES:
                pod_time = now.replace(hour=hour, minute=0, second=0, microsecond=0)
                # If we're within 1 minute of the scheduled time and haven't generated today
                diff = abs((now - pod_time).total_seconds())
                if diff < 60:
                    # Check if we already generated this episode
                    today_key = f"ep_{now.strftime('%Y%m%d_%H')}"
                    if not (EPISODES_DIR / f"{today_key}.json").exists():
                        print(f"[Podcast] Auto-generating episode for {pod_time}")
                        await _run_podcast()
                        print(f"[Podcast] Episode generated")
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[Podcast] Scheduler error: {e}")
            await asyncio.sleep(60)


@app.on_event("startup")
async def startup():
    asyncio.create_task(_scheduler_loop())


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8087)
