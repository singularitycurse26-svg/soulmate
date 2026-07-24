// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title IncentiveToken
 * @notice ERC20 token for the Incentives ecosystem — 1 Trillion max supply, 0% transfer tax.
 *         Includes annual Q3 pre-holiday halving mechanism for emission/reward rate adjustments.
 */
contract IncentiveToken is ERC20, ERC20Burnable, Ownable {
    uint256 public constant MAX_SUPPLY = 1_000_000_000_000 * 10 ** 18; // 1 Trillion

    // Halving mechanism
    uint256 public currentEmissionRate; // current reward/emission rate (basis points)
    uint256 public lastHalvingTimestamp;
    uint256 public halvingCount;
    uint256 private constant MIN_HALVING_INTERVAL = 365 days;
    uint256 private constant INITIAL_EMISSION_RATE = 10000; // 100% in basis points

    event HalvingExecuted(uint256 newRate, uint256 timestamp, uint256 halvingNumber);

    constructor(address recipient) ERC20("Incentive", "INC") Ownable(msg.sender) {
        require(recipient != address(0), "Invalid recipient");
        _mint(recipient, MAX_SUPPLY);
        currentEmissionRate = INITIAL_EMISSION_RATE;
        lastHalvingTimestamp = block.timestamp;
    }

    /**
     * @notice Trigger pre-holiday halving — halves the emission rate.
     *         Owner-only. Enforces minimum 365-day interval between halvings.
     *         Designed to be called every September before Q4 holiday surge.
     */
    function triggerPreHolidayHalving() external onlyOwner {
        require(
            block.timestamp >= lastHalvingTimestamp + MIN_HALVING_INTERVAL,
            "Halving interval not reached"
        );
        require(currentEmissionRate > 0, "Already at minimum emission");

        uint256 newRate = currentEmissionRate / 2;
        currentEmissionRate = newRate;
        lastHalvingTimestamp = block.timestamp;
        halvingCount++;

        emit HalvingExecuted(newRate, block.timestamp, halvingCount);
    }

    /**
     * @notice Get halving info in a single call
     */
    function getHalvingInfo() external view returns (
        uint256 rate,
        uint256 lastHalving,
        uint256 count,
        uint256 nextHalvingTime
    ) {
        rate = currentEmissionRate;
        lastHalving = lastHalvingTimestamp;
        count = halvingCount;
        nextHalvingTime = lastHalvingTimestamp + MIN_HALVING_INTERVAL;
    }
}
