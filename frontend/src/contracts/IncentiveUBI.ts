export const IncentiveUBIABI = [
  // UBI claims
  "function claimUBI() external",
  "function registerForUBI() external",
  "function isRegistered(address account) view returns (bool)",
  "function isEligible(address account) view returns (bool)",
  "function lastClaimTime(address account) view returns (uint256)",
  "function registrationTime(address account) view returns (uint256)",

  // UBI rate info
  "function currentUBIRate() view returns (uint256)",
  "function getUBIInfo() view returns (uint256 poolBalance, uint256 currentRate, uint256 nextHalvingTime, uint256 halvingCount, uint256 totalRecipients, uint256 totalDistributed)",

  // Halving
  "function halvingInterval() view returns (uint256)",
  "function lastHalvingTimestamp() view returns (uint256)",
  "function triggerHalving() external",

  // Pool management
  "function getPoolBalance() view returns (uint256)",
  "function depositToPool(uint256 amount) external",
  "function withdrawExcess(uint256 amount) external",
  "function emergencyMint(uint256 amount) external",

  // Fee routing
  "function receiveFees() external payable",
  "function totalFeesReceived() view returns (uint256)",

  // Staking yield contribution
  "function receiveStakingYield(uint256 amount) external",
  "function totalYieldReceived() view returns (uint256)",

  // Admin
  "function setVerificationRequired(bool required) external",
  "function setHalvingInterval(uint256 interval) external",
  "function setInitialRate(uint256 rate) external",
  "function setWaitingPeriod(uint256 period) external",
  "function token() view returns (address)",
  "function vault() view returns (address)",
  "function owner() view returns (address)",
  "function verificationRequired() view returns (bool)",
  "function waitingPeriod() view returns (uint256)",
  "function maxMintPerYear() view returns (uint256)",
  "function lastMintTime() view returns (uint256)",
  "function totalMinted() view returns (uint256)",

  // Events
  "event UBIRegistered(address indexed account, uint256 timestamp)",
  "event UBIClaimed(address indexed account, uint256 amount, uint256 timestamp)",
  "event HalvingExecuted(uint256 newRate, uint256 timestamp, uint256 halvingNumber)",
  "event FeesReceived(uint256 amount, uint256 timestamp)",
  "event StakingYieldReceived(uint256 amount, uint256 timestamp)",
  "event EmergencyMint(uint256 amount, uint256 timestamp)",
  "event PoolDeposited(uint256 amount, address indexed from)",
  "event ExcessWithdrawn(uint256 amount, address indexed to)",
] as const;

export const IncentiveUBIBytecode = "0x6080604052348015600e575f80fd5b50603e80601a575f80fd5b505f80f3fe";
