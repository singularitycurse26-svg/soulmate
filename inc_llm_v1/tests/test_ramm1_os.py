"""Test the Ramm1 OS — reservation, release, pressure guard, allocator best-fit."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from inc_llm.ramm1.os import Ramm1OS, AllocTicket
from inc_llm.config import Ramm1Config


def test_os_reservation_and_release():
    """Test that the OS can reserve and release RAM."""
    config = Ramm1Config(ram_reservation_gb=0.1, min_total_ram_gb=0.0, ram_pressure_floor_gb=0.0)
    os_obj = Ramm1OS(config)
    ok = os_obj.reserve()
    assert ok, "Reservation should succeed"
    assert os_obj.get_reserved_gb() > 0, "Reserved GB should be > 0"
    os_obj.release()
    assert os_obj.get_reserved_gb() == 0, "Reserved GB should be 0 after release"
    print("PASS: test_os_reservation_and_release")


def test_os_allocator_best_fit():
    """Test the best-fit allocator."""
    config = Ramm1Config(ram_reservation_gb=0.1, min_total_ram_gb=0.0, ram_pressure_floor_gb=0.0)
    os_obj = Ramm1OS(config)
    os_obj.reserve()
    free_before = os_obj.get_free_gb()
    ticket = os_obj.allocate(0.02, "test-model")
    assert ticket is not None, "Allocation should succeed"
    assert os_obj.get_free_gb() < free_before, "Free RAM should decrease after allocation"
    os_obj.free(ticket)
    assert os_obj.get_free_gb() == free_before, "Free RAM should be restored after free"
    os_obj.release()
    print("PASS: test_os_allocator_best_fit")


def test_os_insufficient_allocation():
    """Test that allocating more than available fails."""
    config = Ramm1Config(ram_reservation_gb=0.05, min_total_ram_gb=0.0, ram_pressure_floor_gb=0.0)
    os_obj = Ramm1OS(config)
    os_obj.reserve()
    ticket = os_obj.allocate(999.0, "huge-model")
    assert ticket is None, "Allocation should fail for huge request"
    os_obj.release()
    print("PASS: test_os_insufficient_allocation")


def test_os_status():
    """Test get_local_status."""
    config = Ramm1Config(ram_reservation_gb=0.05, min_total_ram_gb=0.0, ram_pressure_floor_gb=0.0)
    os_obj = Ramm1OS(config)
    os_obj.reserve()
    status = os_obj.get_local_status()
    assert "reserved_gb" in status
    assert "used_gb" in status
    assert "free_gb" in status
    assert "pressure_active" in status
    os_obj.release()
    print("PASS: test_os_status")


if __name__ == "__main__":
    test_os_reservation_and_release()
    test_os_allocator_best_fit()
    test_os_insufficient_allocation()
    test_os_status()
    print("\nAll Ramm1 OS tests passed.")
