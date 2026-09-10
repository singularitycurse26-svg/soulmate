export const IncentiveEscrowABI = [
  // Escrow operations
  "function claimEscrow() external returns (uint256 amount)",
  "function getEscrowInfo() view returns (uint256 totalLocked, uint256 released, uint256 releasable, uint256 nextReleaseTime, uint256 monthsElapsed, uint256 monthlyAmount)",
  "function getMonthlyRelease() view returns (uint256)",
  "function setMonthlyRelease(uint256 amount) external",

  // Time tracking
  "function startTime() view returns (uint256)",
  "function durationMonths() view returns (uint256)",
  "function totalEscrowAmount() view returns (uint256)",
  "function monthsElapsed() view returns (uint256)",
  "function monthsRemaining() view returns (uint256)",

  // Admin
  "function token() view returns (address)",
  "function owner() view returns (address)",
  "function setOwner(address newOwner) external",

  // Events
  "event EscrowClaimed(address indexed owner, uint256 amount, uint256 timestamp)",
  "event MonthlyReleaseUpdated(uint256 oldAmount, uint256 newAmount)",
] as const;

export const IncentiveEscrowBytecode = "0x6080604052348015600e575f80fd5b50603e80601a575f80fd5b505f80f3fe";
