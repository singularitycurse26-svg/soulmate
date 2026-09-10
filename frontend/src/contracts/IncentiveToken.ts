export const IncentiveTokenABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function triggerPreHolidayHalving() external",
  "function currentEmissionRate() view returns (uint256)",
  "function lastHalvingTimestamp() view returns (uint256)",
  "function halvingCount() view returns (uint256)",
  "function getHalvingInfo() view returns (uint256 rate, uint256 lastHalving, uint256 count, uint256 nextHalvingTime)",

  // Burn mechanism
  "function totalBurned() view returns (uint256)",
  "function burnRate() view returns (uint256)",
  "function setBurnRate(uint256 rate) external",
  "function burnFromSupply(uint256 amount) external",

  // Maturity tracking (CLARITY Act)
  "function isMature() view returns (bool)",
  "function getDecentralizationStats() view returns (uint256 eoaBalance, uint256 contractBalance, uint256 eoaPercentage, bool isMature)",

  // Events
  "event HalvingExecuted(uint256 newRate, uint256 timestamp, uint256 halvingNumber)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event Burned(address indexed from, uint256 amount, uint256 timestamp)",
] as const;

export const IncentiveTokenBytecode = "0x6080604052348015600e575f80fd5b50603e80601a575f80fd5b505f80f3fe";
