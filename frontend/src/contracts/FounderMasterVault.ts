export const FounderMasterVaultABI = [
  "function getUnifiedVaultOverview() view returns (uint256 reservesBalance, uint256 lockedInVesting, uint256 releasableFromVesting, uint256 founderEoaBalance, uint256 stakingPoolBalance)",
  "function claimFounderVesting() external",
  "function disburseEcosystemFunds(uint8 category, address recipient, uint256 amount) external",
  "function refillStakingPool(uint256 amount) external",
  "function setVestingContract(address vestingContract) external",
  "function setStakingContract(address stakingContract) external",
  "function initializeReserves(uint256 staking, uint256 marketing, uint256 airdrop) external",
  "function stakingPoolReserve() view returns (uint256)",
  "function marketingReserve() view returns (uint256)",
  "function airdropReserve() view returns (uint256)",
  "function vestingContractAddress() view returns (address)",
  "function stakingContractAddress() view returns (address)",
  "function owner() view returns (address)",
  "event ReservesAllocated(uint256 staking, uint256 marketing, uint256 airdrop)",
  "event FundsDisbursed(string category, address indexed recipient, uint256 amount)",
  "event FounderVestingClaimed(uint256 amount)",
  "event StakingPoolRefilled(uint256 amount)",
] as const;

export const FounderMasterVaultBytecode = "0x6080604052348015600e575f80fd5b50603e80601a575f80fd5b505f80f3fe";
