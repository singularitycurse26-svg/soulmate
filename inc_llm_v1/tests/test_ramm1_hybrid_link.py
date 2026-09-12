"""Test the Hybrid Link API — protocol detection, link request/consent, Link Agent generation, viral propagate."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from inc_llm.ramm1.hybrid_link import HybridLinkAPI, ProtocolAdapter, PROBE_OPENAI, PROBE_MCP, PROBE_CUSTOM
from inc_llm.ramm1.link_agent import LinkAgentGenerator
from inc_llm.config import Ramm1Config


def test_link_agent_generation():
    """Test that Link Agent payloads are generated for each protocol."""
    gen = LinkAgentGenerator()
    for protocol in ["openai", "anthropic", "mcp", "ollama", "custom", "legacy"]:
        agent = gen.for_protocol(protocol, ["http://localhost:8547"])
        assert isinstance(agent, str), f"Link Agent for {protocol} should be a string"
        assert "Universal Ramm1 Link Agent" in agent, f"Link Agent for {protocol} should mention Ramm1"
    print("PASS: test_link_agent_generation")


def test_protocol_adapter_uniform_interface():
    """Test that ProtocolAdapter exposes a uniform interface."""
    adapter = ProtocolAdapter(PROBE_OPENAI, "http://localhost:11434")
    assert hasattr(adapter, "list_models"), "Adapter should have list_models"
    assert hasattr(adapter, "chat"), "Adapter should have chat"
    assert hasattr(adapter, "health"), "Adapter should have health"
    print("PASS: test_protocol_adapter_uniform_interface")


def test_hybrid_link_db():
    """Test that the hybrid link DB initializes and can list links."""
    config = Ramm1Config(hybrid_link_db_path=":memory:")
    api = HybridLinkAPI(config)
    links = api.list_links()
    assert isinstance(links, list), "list_links should return a list"
    status = api.get_status()
    assert "total_links" in status, "Status should have total_links"
    print("PASS: test_hybrid_link_db")


def test_viral_propagate_disabled():
    """Test that propagate returns disabled when propagate_enabled is False."""
    config = Ramm1Config(hybrid_link_enabled=True, hybrid_link_propagate_enabled=False, hybrid_link_db_path=":memory:")
    api = HybridLinkAPI(config)
    import asyncio
    result = asyncio.run(api.propagate())
    assert result["status"] == "disabled", "Propagate should be disabled"
    print("PASS: test_viral_propagate_disabled")


if __name__ == "__main__":
    test_link_agent_generation()
    test_protocol_adapter_uniform_interface()
    test_hybrid_link_db()
    test_viral_propagate_disabled()
    print("\nAll Ramm1 Hybrid Link tests passed.")
