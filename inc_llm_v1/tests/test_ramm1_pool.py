"""Test the Universal RAM Pool — pool tracking, peer add/remove, capacity finding."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from inc_llm.ramm1.os import Ramm1OS
from inc_llm.ramm1.pool import UniversalRAMPool, PeerCapacity
from inc_llm.config import Ramm1Config


def test_pool_tracking():
    """Test pool tracking with local + peers."""
    config = Ramm1Config(ram_reservation_gb=0.05, min_total_ram_gb=0.0, ram_pressure_floor_gb=0.0)
    os_obj = Ramm1OS(config)
    os_obj.reserve()
    pool = UniversalRAMPool(os_obj)
    assert pool.get_pool_total_gb() > 0, "Pool total should be > 0"
    assert pool.get_pool_free_gb() > 0, "Pool free should be > 0"
    os_obj.release()
    print("PASS: test_pool_tracking")


def test_pool_peer_add_remove():
    """Test adding and removing peers."""
    config = Ramm1Config(ram_reservation_gb=0.05, min_total_ram_gb=0.0, ram_pressure_floor_gb=0.0)
    os_obj = Ramm1OS(config)
    os_obj.reserve()
    pool = UniversalRAMPool(os_obj)
    peer = PeerCapacity(peer_id="peer-1", endpoint="http://peer1:8547", reserved_gb=3.5, free_gb=3.5, consent=True)
    pool.add_peer(peer)
    assert pool.get_pool_total_gb() > 3.5, "Pool total should include peer"
    pool.remove_peer("peer-1")
    assert pool.get_pool_total_gb() < 3.5, "Pool total should not include removed peer"
    os_obj.release()
    print("PASS: test_pool_peer_add_remove")


def test_pool_find_capacity():
    """Test find_capacity routing."""
    config = Ramm1Config(ram_reservation_gb=0.05, min_total_ram_gb=0.0, ram_pressure_floor_gb=0.0)
    os_obj = Ramm1OS(config)
    os_obj.reserve()
    pool = UniversalRAMPool(os_obj)
    # Local should fit small requests
    plan = pool.find_capacity(0.01)
    assert plan["node"] == "local", "Small request should route to local"
    # Peer should fit large requests
    peer = PeerCapacity(peer_id="peer-1", endpoint="http://peer1:8547", reserved_gb=3.5, free_gb=3.5, consent=True)
    pool.add_peer(peer)
    plan = pool.find_capacity(2.0)
    assert plan["node"] == "peer", "Large request should route to peer"
    # Insufficient for huge requests
    plan = pool.find_capacity(999.0)
    assert plan["node"] == "insufficient", "Huge request should be insufficient"
    os_obj.release()
    print("PASS: test_pool_find_capacity")


if __name__ == "__main__":
    test_pool_tracking()
    test_pool_peer_add_remove()
    test_pool_find_capacity()
    print("\nAll Ramm1 Pool tests passed.")
