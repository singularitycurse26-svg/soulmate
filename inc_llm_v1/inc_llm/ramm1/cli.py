"""Ramm1 CLI — one CLI for the whole Universal Ramm1 system.

Commands:
  ramm1 status              — full Ramm1 status
  ramm1 pool                — Universal RAM Supply pool status
  ramm1 run <model>         — run a model via the pool
  ramm1 peer join <url>     — join the mesh as a peer
  ramm1 peer leave <id>     — leave the mesh
  ramm1 builder status      — autonomous builder status
  ramm1 memory recall <q>   — recall past turns
  ramm1 memory search <q>   — search past turns
  ramm1 scrape <url>        — scrape a URL
  ramm1 scrape search <q>   — search + scrape
  ramm1 link discover <url> — discover LLMs to link to
  ramm1 link connect <url>  — request a link to a remote LLM
  ramm1 link list           — list all hybrid links
  ramm1 link propagate      — trigger viral propagation
  ramm1 link agent <proto>  — get the Link Agent payload for a protocol
  ramm1 install             — install RAMM1 OS as the Universal LLM Free System
  ramm1 uninstall           — uninstall Ramm1
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
import urllib.error

RAMM1_BASE = "http://localhost:8547/v1/ramm1"


def _get(path: str) -> dict:
    try:
        resp = urllib.request.urlopen(f"{RAMM1_BASE}{path}", timeout=10)
        return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}", "detail": e.read().decode()[:200]}
    except Exception as e:
        return {"error": str(e)}


def _post(path: str, body: dict | None = None) -> dict:
    data = json.dumps(body or {}).encode()
    req = urllib.request.Request(f"{RAMM1_BASE}{path}", data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}", "detail": e.read().decode()[:200]}
    except Exception as e:
        return {"error": str(e)}


def _print(data: dict) -> None:
    print(json.dumps(data, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(prog="ramm1", description="Universal Ramm1 CLI")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("status", help="Full Ramm1 status")
    sub.add_parser("pool", help="Universal RAM Supply pool status")

    run_p = sub.add_parser("run", help="Run a model via the pool")
    run_p.add_argument("model")
    run_p.add_argument("--message", default="Hello")

    peer_p = sub.add_parser("peer", help="Peer mesh commands")
    peer_sub = peer_p.add_subparsers(dest="peer_cmd", required=True)
    peer_join = peer_sub.add_parser("join", help="Join the mesh")
    peer_join.add_argument("endpoint")
    peer_leave = peer_sub.add_parser("leave", help="Leave the mesh")
    peer_leave.add_argument("peer_id")

    builder_p = sub.add_parser("builder", help="Autonomous builder commands")
    builder_sub = builder_p.add_subparsers(dest="builder_cmd", required=True)
    builder_sub.add_parser("status", help="Builder status")

    mem_p = sub.add_parser("memory", help="Memory commands")
    mem_sub = mem_p.add_subparsers(dest="mem_cmd", required=True)
    mem_recall = mem_sub.add_parser("recall", help="Recall past turns")
    mem_recall.add_argument("query")
    mem_search = mem_sub.add_parser("search", help="Search past turns")
    mem_search.add_argument("query")

    scrape_p = sub.add_parser("scrape", help="Web scraper commands")
    scrape_sub = scrape_p.add_subparsers(dest="scrape_cmd", required=True)
    scrape_url = scrape_sub.add_parser("url", help="Scrape a URL")
    scrape_url.add_argument("url")
    scrape_search = scrape_sub.add_parser("search", help="Search + scrape")
    scrape_search.add_argument("query")

    link_p = sub.add_parser("link", help="Hybrid link commands")
    link_sub = link_p.add_subparsers(dest="link_cmd", required=True)
    link_discover = link_sub.add_parser("discover", help="Discover LLMs")
    link_discover.add_argument("endpoint")
    link_connect = link_sub.add_parser("connect", help="Connect to a remote LLM")
    link_connect.add_argument("endpoint")
    link_sub.add_parser("list", help="List all links")
    link_sub.add_parser("propagate", help="Trigger viral propagation")
    link_agent = link_sub.add_parser("agent", help="Get Link Agent payload")
    link_agent.add_argument("protocol")

    sub.add_parser("install", help="Install RAMM1 OS as the Universal LLM Free System")
    sub.add_parser("uninstall", help="Uninstall Ramm1")

    args = parser.parse_args()

    if args.cmd == "status":
        _print(_get("/status"))
    elif args.cmd == "pool":
        _print(_get("/pool"))
    elif args.cmd == "run":
        _print(_post("/run", {"model": args.model, "messages": [{"role": "user", "content": args.message}]}))
    elif args.cmd == "peer":
        if args.peer_cmd == "join":
            _print(_post("/peers/join", {"endpoint": args.endpoint}))
        elif args.peer_cmd == "leave":
            _print(_post("/peers/leave", {"peer_id": args.peer_id}))
    elif args.cmd == "builder":
        if args.builder_cmd == "status":
            _print(_get("/builder/status"))
    elif args.cmd == "memory":
        if args.mem_cmd == "recall":
            _print(_get(f"/memory/recall?query={urllib.parse.quote(args.query)}"))
        elif args.mem_cmd == "search":
            _print(_post("/memory/search", {"query": args.query}))
    elif args.cmd == "scrape":
        if args.scrape_cmd == "url":
            _print(_post("/scrape", {"url": args.url}))
        elif args.scrape_cmd == "search":
            _print(_post("/scrape/search", {"query": args.query}))
    elif args.cmd == "link":
        if args.link_cmd == "discover":
            _print(_post("/link/discover", {"endpoints": [args.endpoint]}))
        elif args.link_cmd == "connect":
            _print(_post("/link/connect", {"endpoint": args.endpoint}))
        elif args.link_cmd == "list":
            _print(_get("/link/list"))
        elif args.link_cmd == "propagate":
            _print(_post("/link/propagate", {}))
        elif args.link_cmd == "agent":
            _print(_get(f"/link/agent/{args.protocol}"))
    elif args.cmd == "install":
        from inc_llm.ramm1.install import Ramm1Installer
        installer = Ramm1Installer()
        _print(installer.install())
    elif args.cmd == "uninstall":
        from inc_llm.ramm1.install import Ramm1Installer
        installer = Ramm1Installer()
        _print(installer.uninstall())
    else:
        parser.print_help()
        return 1
    return 0


if __name__ == "__main__":
    import urllib.parse
    sys.exit(main())
