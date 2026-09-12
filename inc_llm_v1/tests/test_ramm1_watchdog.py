"""Test the RAM Lock Watchdog — always-connected detector.

Simulates a lock loss and verifies the watchdog automatically re-reserves the RAM.
"""

import asyncio
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from inc_llm.ramm1.os import Ramm1OS, RamLockWatchdog
from inc_llm.config import Ramm1Config


async def test_watchdog_relock():
    """Test that the watchdog re-locks the RAM after a simulated lock loss."""
    config = Ramm1Config(
        ram_reservation_gb=0.05,
        min_total_ram_gb=0.0,
        ram_pressure_floor_gb=0.0,
    )
    os_obj = Ramm1OS(config)

    # Reserve RAM
    reserved = os_obj.reserve()
    assert reserved, "Should reserve RAM initially"
    assert os_obj.get_reserved_gb() > 0, "Should have reserved GB > 0"
    print(f"PASS: initial reservation ({os_obj.get_reserved_gb():.3f} GB)")

    # Start watchdog with fast check interval
    watchdog = RamLockWatchdog(os_obj, check_interval_s=0.5)
    await watchdog.start()
    assert watchdog._running, "Watchdog should be running"
    print("PASS: watchdog started")

    # Wait one cycle to confirm watchdog sees the lock
    await asyncio.sleep(1.0)
    status = watchdog.get_status()
    assert status["lock_held"], "Lock should be held"
    assert status["lock_lost_count"] == 0, "No lock loss yet"
    print("PASS: watchdog confirms lock held")

    # Simulate lock loss — release the reservation
    os_obj.release()
    assert os_obj.get_reserved_gb() == 0, "Reservation should be released"
    assert os_obj._region is None, "Region should be None"
    print("PASS: simulated lock loss")

    # Wait for watchdog to detect and re-lock
    relocked = False
    for _ in range(20):
        await asyncio.sleep(0.5)
        if os_obj.get_reserved_gb() > 0 and os_obj._region is not None:
            relocked = True
            break

    assert relocked, "Watchdog should have re-locked the RAM"
    status = watchdog.get_status()
    assert status["lock_lost_count"] >= 1, "Should have detected at least 1 lock loss"
    assert status["relock_count"] >= 1, "Should have re-locked at least 1 time"
    assert status["lock_held"], "Lock should be held after re-lock"
    print(f"PASS: watchdog auto-relocked (lost={status['lock_lost_count']}, relocked={status['relock_count']})")

    # Stop watchdog and clean up
    await watchdog.stop()
    os_obj.release()
    print("PASS: watchdog stopped and cleaned up")

    print("\nAll RAM Lock Watchdog tests passed.")


if __name__ == "__main__":
    asyncio.run(test_watchdog_relock())
