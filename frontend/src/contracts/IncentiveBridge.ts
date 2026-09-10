export const IncentiveBridgeABI = [
  // Bridge operations
  "function bridgeSend(address tokenIn, uint256 amount, address recipient, address tokenOut) external returns (uint256 bridgeId)",
  "function bridgeClaim(uint256 bridgeId) external",
  "function getBridgeQuote(address tokenIn, address tokenOut, uint256 amount) view returns (uint256 outputAmount, uint256 fee)",

  // Liquidity management
  "function getLiquidity(address token) view returns (uint256)",
  "function addLiquidity(address token, uint256 amount) external",
  "function withdrawLiquidity(address token, uint256 amount) external",

  // Stats
  "function totalBridged() view returns (uint256)",
  "function getBridgeStats() view returns (uint256 totalVolume, uint256 totalLiquidity, uint256 totalFees, uint256 activeBridges)",
  "function getBridgeInfo(uint256 bridgeId) view returns (address sender, address recipient, address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOut, uint256 fee, bool claimed, uint256 timestamp)",

  // Supported tokens
  "function supportedTokens(address token) view returns (bool)",
  "function addSupportedToken(address token) external",
  "function removeSupportedToken(address token) external",
  "function getSupportedTokens() view returns (address[])",

  // KYC tier limits
  "function setDailyLimit(uint8 tier, uint256 limit) external",
  "function getDailyLimit(uint8 tier) view returns (uint256)",
  "function getKYCTier(address account) view returns (uint8)",
  "function setKYCTier(address account, uint8 tier) external",
  "function getDailySpent(address account) view returns (uint256)",
  "function resetDailySpent(address account) external",

  // Sanctions screening
  "function isSanctioned(address account) view returns (bool)",
  "function addToSanctionsList(address account) external",
  "function removeFromSanctionsList(address account) external",

  // Admin
  "function token() view returns (address)",
  "function owner() view returns (address)",
  "function feeRate() view returns (uint256)",
  "function setFeeRate(uint256 rate) external",

  // Events
  "event BridgeSent(uint256 indexed bridgeId, address indexed sender, address indexed recipient, address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOut, uint256 fee)",
  "event BridgeClaimed(uint256 indexed bridgeId, address indexed recipient, uint256 amountOut)",
  "event LiquidityAdded(address indexed token, uint256 amount, address indexed provider)",
  "event LiquidityWithdrawn(address indexed token, uint256 amount, address indexed to)",
  "event SupportedTokenAdded(address indexed token)",
  "event SupportedTokenRemoved(address indexed token)",
  "event SanctionsUpdated(address indexed account, bool sanctioned)",
] as const;

export const IncentiveBridgeBytecode = "0x6080604052348015600e575f80fd5b50603e80601a575f80fd5b505f80f3fe";
