// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IVestingContract {
    function release() external;
    function releasableAmount() external view returns (uint256);
}

interface IStakingContract {
    function notifyRewardFromBalance(uint256 amount) external;
}

/**
 * @title FounderMasterVault
 * @notice Unified 3-in-1 Founder Vault System aggregating Ecosystem Reserves,
 *         Locked Vesting, and EOA Treasury tracking under one controllable interface.
 *
 * Sub-Wallet #1: Ecosystem Reserves (200B staking, 150B marketing, 100B airdrop)
 * Sub-Wallet #2: Founder Vesting (linked, 1-click claim)
 * Sub-Wallet #3: Treasury = Founder EOA wallet (balance tracking only)
 */
contract FounderMasterVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable incToken;
    address public vestingContractAddress;
    address public stakingContractAddress;

    // Sub-Wallet 1: Ecosystem Reserve Trackers
    uint256 public stakingPoolReserve;   // 200 Billion target
    uint256 public marketingReserve;     // 150 Billion target
    uint256 public airdropReserve;       // 100 Billion target

    event ReservesAllocated(uint256 staking, uint256 marketing, uint256 airdrop);
    event FundsDisbursed(string category, address indexed recipient, uint256 amount);
    event FounderVestingClaimed(uint256 amount);
    event StakingPoolRefilled(uint256 amount);
    event VestingContractUpdated(address indexed vestingContract);
    event StakingContractUpdated(address indexed stakingContract);

    constructor(address _incToken) Ownable(msg.sender) {
        require(_incToken != address(0), "Invalid token address");
        incToken = IERC20(_incToken);
    }

    /**
     * @notice Link the deployed Vesting Contract to the Master Vault
     */
    function setVestingContract(address _vestingContract) external onlyOwner {
        require(_vestingContract != address(0), "Invalid address");
        vestingContractAddress = _vestingContract;
        emit VestingContractUpdated(_vestingContract);
    }

    /**
     * @notice Link the deployed Staking Contract to the Master Vault
     */
    function setStakingContract(address _stakingContract) external onlyOwner {
        require(_stakingContract != address(0), "Invalid address");
        stakingContractAddress = _stakingContract;
        emit StakingContractUpdated(_stakingContract);
    }

    /**
     * @notice Initialize ecosystem reserve balances inside Sub-Wallet 1
     */
    function initializeReserves(
        uint256 _staking,
        uint256 _marketing,
        uint256 _airdrop
    ) external onlyOwner {
        stakingPoolReserve = _staking;
        marketingReserve = _marketing;
        airdropReserve = _airdrop;
        emit ReservesAllocated(_staking, _marketing, _airdrop);
    }

    /**
     * @notice Disburse tokens from Sub-Wallet 1 (Ecosystem Reserves)
     * @param category 0 = Staking, 1 = Marketing, 2 = Airdrop
     */
    function disburseEcosystemFunds(
        uint8 category,
        address recipient,
        uint256 amount
    ) external onlyOwner nonReentrant {
        require(recipient != address(0), "Invalid recipient");

        if (category == 0) {
            require(stakingPoolReserve >= amount, "Exceeds staking reserve balance");
            stakingPoolReserve -= amount;
            emit FundsDisbursed("STAKING", recipient, amount);
        } else if (category == 1) {
            require(marketingReserve >= amount, "Exceeds marketing reserve balance");
            marketingReserve -= amount;
            emit FundsDisbursed("MARKETING", recipient, amount);
        } else if (category == 2) {
            require(airdropReserve >= amount, "Exceeds airdrop reserve balance");
            airdropReserve -= amount;
            emit FundsDisbursed("AIRDROP", recipient, amount);
        } else {
            revert("Invalid category");
        }

        incToken.safeTransfer(recipient, amount);
    }

    /**
     * @notice 1-Click Founder Claim: Pulls unlocked tokens from Sub-Wallet 2
     *         directly to the Founder EOA Treasury.
     */
    function claimFounderVesting() external onlyOwner nonReentrant {
        require(vestingContractAddress != address(0), "Vesting contract not configured");

        uint256 releasable = IVestingContract(vestingContractAddress).releasableAmount();
        require(releasable > 0, "No unlocked tokens available in Vesting");

        IVestingContract(vestingContractAddress).release();
        emit FounderVestingClaimed(releasable);
    }

    /**
     * @notice Convenience: Disburse staking reserve directly to linked staking contract
     *         and call notifyRewardAmount to start a new reward cycle.
     */
    function refillStakingPool(uint256 amount) external onlyOwner nonReentrant {
        require(stakingContractAddress != address(0), "Staking contract not configured");
        require(stakingPoolReserve >= amount, "Exceeds staking reserve balance");

        stakingPoolReserve -= amount;
        incToken.safeTransfer(stakingContractAddress, amount);
        IStakingContract(stakingContractAddress).notifyRewardFromBalance(amount);

        emit StakingPoolRefilled(amount);
        emit FundsDisbursed("STAKING_REFILL", stakingContractAddress, amount);
    }

    /**
     * @notice View aggregate status across all 3 sub-wallets under the Founder Account.
     * @return reservesBalance INC balance of this vault (Sub-Wallet 1)
     * @return lockedInVesting INC balance locked in vesting contract (Sub-Wallet 2)
     * @return releasableFromVesting Currently unlockable from vesting
     * @return founderEoaBalance INC balance of founder EOA (Sub-Wallet 3)
     * @return stakingPoolBalance INC balance in staking contract
     */
    function getUnifiedVaultOverview() external view returns (
        uint256 reservesBalance,
        uint256 lockedInVesting,
        uint256 releasableFromVesting,
        uint256 founderEoaBalance,
        uint256 stakingPoolBalance
    ) {
        reservesBalance = incToken.balanceOf(address(this));

        if (vestingContractAddress != address(0)) {
            lockedInVesting = incToken.balanceOf(vestingContractAddress);
            releasableFromVesting = IVestingContract(vestingContractAddress).releasableAmount();
        }

        founderEoaBalance = incToken.balanceOf(owner());

        if (stakingContractAddress != address(0)) {
            stakingPoolBalance = incToken.balanceOf(stakingContractAddress);
        }
    }
}
