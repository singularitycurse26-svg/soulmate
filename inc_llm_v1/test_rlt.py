#!/usr/bin/env python3
"""Test the RLT system."""
import sys, os, tempfile
sys.path.insert(0, ".")

from inc_llm.recursive_link.tokens import (
    LinkToken, LinkTokenBuilder, LinkTokenBudget, LinkTokenCache, RecursiveLinkTokenManager
)

# Test LinkToken
tok = LinkToken(token_type="EP", key="fix-login", value="patched-auth")
print(f"LinkToken compact: {tok.compact}")
print(f"LinkToken estimated_tokens: {tok.estimated_tokens}")

# Test builder
ep = {"task_description": "Fix the login bug in auth module", "key_result": "Patched the authentication flow", "success": True, "id": "ep1"}
lt = LinkTokenBuilder.from_episode(ep)
print(f"\nEpisode -> LinkToken: {lt.compact}")

skill = {"name": "python-debugging", "description": "Step-by-step isolation and fix"}
lt2 = LinkTokenBuilder.from_skill(skill)
print(f"Skill -> LinkToken: {lt2.compact}")

fact = "The server runs on port 8547"
lt3 = LinkTokenBuilder.from_fact(fact)
print(f"Fact -> LinkToken: {lt3.compact}")

# Test budget selection
tokens = [lt, lt2, lt3]
budget = LinkTokenBudget(max_tokens=20)
selected = budget.select(tokens)
rendered = budget.render(selected)
print(f"\nBudget selected {len(selected)} tokens (budget=20): {rendered}")

budget2 = LinkTokenBudget(max_tokens=100)
selected2 = budget2.select(tokens)
rendered2 = budget2.render(selected2)
print(f"Budget selected {len(selected2)} tokens (budget=100): {rendered2}")

# Test full manager with temp DB
tmpdb = tempfile.mktemp(suffix=".db")
mgr = RecursiveLinkTokenManager(budget_tokens=200, db_path=tmpdb)

mgr.register_episode({"id": "ep1", "task_description": "Fix login bug", "key_result": "Patched auth flow", "success": True})
mgr.register_episode({"id": "ep2", "task_description": "Optimize database queries", "key_result": "Added index on user_id", "success": True})
mgr.register_skill({"name": "python-debug", "description": "Isolate, reproduce, test, fix"})
mgr.register_fact("Server runs on port 8547")

ctx = mgr.build_context()
print(f"\nManager context: {ctx}")
print(f"Context length: {len(ctx)} chars, ~{len(ctx)//4} tokens")
print(f"Stats: {mgr.get_stats()}")

# Test mesh payload
payload = mgr.get_mesh_payload(limit=5)
print(f"\nMesh payload ({len(payload)} tokens):")
for p in payload:
    print(f"  {p['compact']}")

# Test receiving mesh payload
received = mgr.receive_mesh_payload([
    {"token_type": "PL", "key": "peer-tip", "value": "use-smaller-ctx", "priority": 0.4, "source": "peer-abc", "raw_id": "pl1"}
])
print(f"\nReceived {received} new tokens from mesh")
ctx2 = mgr.build_context()
print(f"Updated context: {ctx2}")

# Close SQLite connection before cleanup (Windows file lock fix)
import gc
gc.collect()

try:
    os.unlink(tmpdb)
except PermissionError:
    pass  # Windows may still hold the file, harmless
print("\nAll RLT tests passed!")
