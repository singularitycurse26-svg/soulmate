// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IncentiveVesting
 * @notice 250 Billion INC locked for 5 years with quarterly (90-day) release.
 *         Founder can claim unlocked tokens via release().
 */
contract IncentiveVesting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable incToken;
    address public founder;

    uint256 public constant TOTAL_VESTING = 250_000_000_000 * 10 ** 18; // 250 Billion
    uint256 public constant VESTING_DURATION = 5 * 365 days; // 5 years
    uint256 public constant QUARTER_DURATION = 90 days; // 90 days per quarter
    uint256 public constant TOTAL_QUARTERS = 20; // 20 quarters over 5 years

    uint256 public startTime;
    uint256 public releasedAmount;

    event TokensReleased(uint256 amount, uint256 timestamp);
    event FounderUpdated(address newFounder);

    constructor(address _incToken, address _founder) Ownable(msg.sender) {
        require(_incToken != address(0), "Invalid token address");
        require(_founder != address(0), "Invalid founder address");
        incToken = IERC20(_incToken);
        founder = _founder;
        startTime = block.timestamp;
    }

    /**
     * @notice Calculate the amount of tokens currently releasable.
     */
    function releasableAmount() public view returns (uint256) {
        uint256 elapsed = block.timestamp - startTime;
        if (elapsed >= VESTING_DURATION) {
            return incToken.balanceOf(address(this)) ;
        }

        uint256 quartersElapsed = elapsed / QUARTER_DURATION;
        uint256 perQuarter = TOTAL_VESTING / TOTAL_QUARTERS;
        uint256 vested = quartersElapsed * perQuarter;
        return vested - releasedAmount;
    }

    /**
     * @notice Release unlocked tokens to the founder.
     */
    function release() external nonReentrant {
        require(msg.sender == founder || msg.sender == owner(), "Not authorized");
        uint256 releasable = releasableAmount();
        require(releasable > 0, "No tokens to release");

        releasedAmount += releasable;
        incToken.safeTransfer(founder, releasable);

        emit TokensReleased(releasable, block.timestamp);
    }

    /**
     * @notice Update founder address (owner only).
     */
    function setFounder(address _newFounder) external onlyOwner {
        require(_newFounder != address(0), "Invalid address");
        founder = _newFounder;
        emit FounderUpdated(_newFounder);
    }

    /**
     * @notice Get vesting schedule info.
     */
    function getVestingInfo() external view returns (
        uint256 totalVesting,
        uint256 released,
        uint256 releasable,
        uint256 start,
        uint256 duration,
        uint256 quartersElapsed,
        uint256 nextReleaseTime
    ) {
        uint256 elapsed = block.timestamp - startTime;
        uint256 quarters = elapsed / QUARTER_DURATION;
        if (elapsed >= VESTING_DURATION) quarters = TOTAL_QUARTERS;

        return (
            TOTAL_VESTING,
            releasedAmount,
            releasableAmount(),
            startTime,
            VESTING_DURATION,
            quarters,
            startTime + ((quarters + 1) * QUARTER_DURATION)
        );
    }
}
