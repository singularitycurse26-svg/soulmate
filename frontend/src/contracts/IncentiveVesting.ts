export const IncentiveVestingABI = [
  "function releasableAmount() view returns (uint256)",
  "function release() external",
  "function releasedAmount() view returns (uint256)",
  "function founder() view returns (address)",
  "function startTime() view returns (uint256)",
  "function getVestingInfo() view returns (uint256 totalVesting, uint256 released, uint256 releasable, uint256 start, uint256 duration, uint256 quartersElapsed, uint256 nextReleaseTime)",
  "function setFounder(address newFounder) external",
  "event TokensReleased(uint256 amount, uint256 timestamp)",
] as const;

export const IncentiveVestingBytecode = "0x6080604052348015600e575f80fd5b50603e80601a575f80fd5b505f80f3fe";
