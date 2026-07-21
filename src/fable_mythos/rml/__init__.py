"""RML package — Reinforcement Machine Learning for prompt and parameter tuning.

Uses feedback signals from completed sessions to adjust:
- Prompt hints (additive context injected before specific phases)
- Temperature parameters (adjust per-role based on success/failure patterns)
- Max tokens (adjust based on output length patterns)

Persists preferences to a JSON file for continuity across sessions.
"""
