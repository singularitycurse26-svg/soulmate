export const IncentiveGamingStakingABI = [
  "function stake(uint256 amount) external",
  "function withdraw(uint256 amount) external",
  "function claimReward() external",
  "function earned(address account) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function rewardRate() view returns (uint256)",
  "function rewardsDuration() view returns (uint256)",
  "function finishAt() view returns (uint256)",
  "function notifyRewardAmount(uint256 amount) external",
  "function notifyRewardFromBalance(uint256 amount) external",
  "function setRewardsDuration(uint256 duration) external",
  "function getAPY() view returns (uint256)",
  "function getStakingInfo() view returns (uint256 totalStaked, uint256 rate, uint256 finish, uint256 duration, uint256 apy)",
  "event Staked(address indexed user, uint256 amount)",
  "event Withdrawn(address indexed user, uint256 amount)",
  "event RewardPaid(address indexed user, uint256 reward)",
  "event RewardAdded(uint256 reward, uint256 duration)",
] as const;

export const IncentiveGamingStakingBytecode = "0x6080604052348015600e575f80fd5b50603e80601a575f80fd5b505f80f3fe";
