"""Test the Adaptive Model Selector — tier selection based on available RAM."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from inc_llm.ramm1.selector import AdaptiveModelSelector, TIER_MODEL_PREFERENCES
from inc_llm.ramm1.manifest import ModelManifest
from inc_llm.config import Ramm1Config


def test_selector_tiers_exist():
    """Test that tier preferences are defined."""
    assert "minimal" in TIER_MODEL_PREFERENCES, "minimal tier should exist"
    assert "standard" in TIER_MODEL_PREFERENCES, "standard tier should exist"
    assert "full" in TIER_MODEL_PREFERENCES, "full tier should exist"
    print("PASS: test_selector_tiers_exist")


def test_selector_get_tier():
    """Test that get_tier returns a valid tier name."""
    config = Ramm1Config()
    manifest = ModelManifest()
    selector = AdaptiveModelSelector(config, manifest, pool=None)
    tier = selector.get_tier()
    assert tier in TIER_MODEL_PREFERENCES, f"Tier {tier} should be in TIER_MODEL_PREFERENCES"
    print("PASS: test_selector_get_tier")


def test_selector_select_local():
    """Test that select_local returns a dict with expected fields."""
    config = Ramm1Config()
    manifest = ModelManifest()
    selector = AdaptiveModelSelector(config, manifest, pool=None)
    result = selector.select_local()
    assert isinstance(result, dict), "select_local should return a dict"
    assert "model" in result, "Result should have model field"
    assert "tier" in result, "Result should have tier field"
    assert "fits_local" in result, "Result should have fits_local field"
    print("PASS: test_selector_select_local")


if __name__ == "__main__":
    test_selector_tiers_exist()
    test_selector_get_tier()
    test_selector_select_local()
    print("\nAll Ramm1 Selector tests passed.")
