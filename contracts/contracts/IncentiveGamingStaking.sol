// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IncentiveGamingStaking
 * @notice Synthetix-style staking contract for INC tokens.
 *         Users stake INC, earn INC rewards from the ecosystem reserve pool.
 *         Owner (FounderMasterVault) tops up rewards via notifyRewardAmount().
 */
contract IncentiveGamingStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakingToken;

    // Reward distribution state (Synthetix-style)
    uint256 public rewardRate;
    uint256 public rewardsDuration;
    uint256 public finishAt;
    uint256 public lastUpdatedAt;
    uint256 public rewardPerTokenStored;

    // User state
    struct UserInfo {
        uint256 stakedAmount;
        uint256 rewardPerTokenPaid;
        uint256 rewards;
    }
    mapping(address => UserInfo) public users;

    uint256 private _totalSupply;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardAdded(uint256 reward, uint256 duration);
    event RewardsDurationUpdated(uint256 newDuration);

    constructor(address _stakingToken) Ownable(msg.sender) {
        require(_stakingToken != address(0), "Invalid token address");
        stakingToken = IERC20(_stakingToken);
        rewardsDuration = 90 days; // Default 90-day reward cycle
    }

    // ============ View Functions ============

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view returns (uint256) {
        return users[account].stakedAmount;
    }

    /**
     * @notice Current reward per token (accumulated).
     */
    function rewardPerToken() public view returns (uint256) {
        if (_totalSupply == 0) {
            return rewardPerTokenStored;
        }
        return rewardPerTokenStored + (_rewardPerTokenDelta() * 1e18) / _totalSupply;
    }

    function _rewardPerTokenDelta() internal view returns (uint256) {
        if (block.timestamp < finishAt || finishAt == 0) {
            if (lastUpdatedAt == 0) return 0;
            return (block.timestamp - lastUpdatedAt) * rewardRate;
        }
        if (lastUpdatedAt >= finishAt) return 0;
        return (finishAt - lastUpdatedAt) * rewardRate;
    }

    /**
     * @notice Pending rewards for an account.
     */
    function earned(address account) public view returns (uint256) {
        UserInfo memory user = users[account];
        uint256 currentRewardPerToken = rewardPerToken();
        return user.stakedAmount * (currentRewardPerToken - user.rewardPerTokenPaid) / 1e18 + user.rewards;
    }

    /**
     * @notice Current APY based on reward rate and total staked.
     */
    function getAPY() external view returns (uint256) {
        if (_totalSupply == 0 || rewardRate == 0) return 0;
        uint256 yearlyRewards = rewardRate * 365 days;
        return (yearlyRewards * 10000) / _totalSupply; // APY in basis points (10000 = 100%)
    }

    function getStakingInfo() external view returns (
        uint256 totalStaked,
        uint256 rate,
        uint256 finish,
        uint256 duration,
        uint256 apy
    ) {
        totalStaked = _totalSupply;
        rate = rewardRate;
        finish = finishAt;
        duration = rewardsDuration;
        if (_totalSupply == 0 || rewardRate == 0) {
            apy = 0;
        } else {
            apy = (rewardRate * 365 days * 10000) / _totalSupply;
        }
    }

    // ============ Mutative Functions ============

    /**
     * @notice Stake INC tokens.
     */
    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        require(amount > 0, "Cannot stake 0");

        _totalSupply += amount;
        users[msg.sender].stakedAmount += amount;

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Staked(msg.sender, amount);
    }

    /**
     * @notice Withdraw staked INC tokens and claim pending rewards.
     */
    function withdraw(uint256 amount) external nonReentrant updateReward(msg.sender) {
        require(amount > 0, "Cannot withdraw 0");
        require(users[msg.sender].stakedAmount >= amount, "Insufficient staked balance");

        _totalSupply -= amount;
        users[msg.sender].stakedAmount -= amount;

        stakingToken.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);

        // Also claim rewards on withdraw
        _claimReward(msg.sender);
    }

    /**
     * @notice Claim pending rewards without withdrawing stake.
     */
    function claimReward() external nonReentrant updateReward(msg.sender) {
        _claimReward(msg.sender);
    }

    function _claimReward(address account) internal {
        uint256 reward = users[account].rewards;
        if (reward > 0) {
            users[account].rewards = 0;
            stakingToken.safeTransfer(account, reward);
            emit RewardPaid(account, reward);
        }
    }

    // ============ Owner Functions ============

    /**
     * @notice Top up reward pool and start a new reward cycle.
     *         Called by FounderMasterVault.refillStakingPool() or directly by owner.
     */
    function notifyRewardAmount(uint256 amount) external onlyOwner updateReward(address(0)) {
        require(amount > 0, "Cannot notify 0");

        // Transfer reward tokens from caller
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        _setRewardRate(amount, rewardsDuration);

        emit RewardAdded(amount, rewardsDuration);
    }

    /**
     * @notice Top up reward pool using tokens already in the contract.
     *         Called by FounderMasterVault.refillStakingPool() after transferring tokens.
     */
    function notifyRewardFromBalance(uint256 amount) external onlyOwner updateReward(address(0)) {
        require(amount > 0, "Cannot notify 0");
        require(
            stakingToken.balanceOf(address(this)) >= _totalSupply + amount,
            "Insufficient contract balance for rewards"
        );

        _setRewardRate(amount, rewardsDuration);

        emit RewardAdded(amount, rewardsDuration);
    }

    function _setRewardRate(uint256 amount, uint256 duration) internal {
        if (block.timestamp >= finishAt || finishAt == 0) {
            rewardRate = amount / duration;
        } else {
            uint256 remaining = finishAt - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            rewardRate = (amount + leftover) / duration;
        }

        lastUpdatedAt = block.timestamp;
        finishAt = block.timestamp + duration;
    }

    /**
     * @notice Update rewards duration (owner only).
     */
    function setRewardsDuration(uint256 _duration) external onlyOwner {
        require(_duration > 0, "Invalid duration");
        require(block.timestamp > finishAt || finishAt == 0, "Reward period still active");
        rewardsDuration = _duration;
        emit RewardsDurationUpdated(_duration);
    }

    // ============ Modifier ============

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdatedAt = lastTimeRewardApplicable();
        if (account != address(0)) {
            users[account].rewards = earned(account);
            users[account].rewardPerTokenPaid = rewardPerTokenStored;
        }
        _;
    }

    function lastTimeRewardApplicable() internal view returns (uint256) {
        if (block.timestamp < finishAt) {
            return block.timestamp;
        }
        return finishAt;
    }
}
