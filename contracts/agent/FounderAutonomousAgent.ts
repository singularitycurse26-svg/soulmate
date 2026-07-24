import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org/";
const FOUNDER_PRIVATE_KEY = process.env.FOUNDER_PRIVATE_KEY || process.env.BSC_PRIVATE_KEY || "";

const INC_TOKEN_ADDRESS = process.env.INC_TOKEN_ADDRESS || "";
const MASTER_VAULT_ADDRESS = process.env.MASTER_VAULT_ADDRESS || "";
const VESTING_ADDRESS = process.env.VESTING_ADDRESS || "";
const STAKING_ADDRESS = process.env.STAKING_ADDRESS || "";
const FEE_WALLET = "0x7Fb10c467319Dd4C9CEB3fcF018C2101a0842D8d";

const SOULMATE_API_URL = process.env.SOULMATE_API_URL || "https://191.44.121.29.sslip.io";
const SOULMATE_API_TOKEN = process.env.SOULMATE_API_TOKEN || "soulmate_wallet_2024";

const MASTER_VAULT_ABI = [
  "function getUnifiedVaultOverview() view returns (uint256, uint256, uint256, uint256, uint256)",
  "function claimFounderVesting() external",
  "function disburseEcosystemFunds(uint8 category, address recipient, uint256 amount) external",
  "function refillStakingPool(uint256 amount) external",
  "function stakingPoolReserve() view returns (uint256)",
  "function owner() view returns (address)",
];

const STAKING_ABI = [
  "function totalSupply() view returns (uint256)",
  "function finishAt() view returns (uint256)",
  "function notifyRewardFromBalance(uint256 amount) external",
];

const TOKEN_ABI = [
  "function triggerPreHolidayHalving() external",
  "function lastHalvingTimestamp() view returns (uint256)",
  "function currentEmissionRate() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

class FounderAutonomousAgent {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private vaultContract: ethers.Contract;
  private stakingContract: ethers.Contract;
  private tokenContract: ethers.Contract;
  private isProcessing = false;

  constructor() {
    if (!FOUNDER_PRIVATE_KEY) throw new Error("FOUNDER_PRIVATE_KEY or BSC_PRIVATE_KEY required");
    if (!INC_TOKEN_ADDRESS) throw new Error("INC_TOKEN_ADDRESS required");
    if (!MASTER_VAULT_ADDRESS) throw new Error("MASTER_VAULT_ADDRESS required");

    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    this.wallet = new ethers.Wallet(FOUNDER_PRIVATE_KEY, this.provider);
    this.vaultContract = new ethers.Contract(MASTER_VAULT_ADDRESS, MASTER_VAULT_ABI, this.wallet);
    this.stakingContract = new ethers.Contract(STAKING_ADDRESS, STAKING_ABI, this.wallet);
    this.tokenContract = new ethers.Contract(INC_TOKEN_ADDRESS, TOKEN_ABI, this.wallet);
  }

  private async log(message: string, type = "INFO") {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [FOUNDER-AGENT-${type}] ${message}`);

    try {
      await fetch(`${SOULMATE_API_URL}/v1/agent/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Token": SOULMATE_API_TOKEN },
        body: JSON.stringify({ timestamp, type, message }),
      });
    } catch {}
  }

  /**
   * Task 1: Check and Auto-Claim Quarterly Founder Vesting
   */
  async checkAndClaimVesting() {
    try {
      const overview = await this.vaultContract.getUnifiedVaultOverview();
      const releasableAmount = overview[2] as bigint;

      if (releasableAmount > 0n) {
        const formatted = ethers.formatEther(releasableAmount);
        await this.log(`Unlocked Vesting Detected: ${formatted} INC! Executing Autonomous Claim...`, "ACTION");

        const tx = await this.vaultContract.claimFounderVesting();
        await this.log(`Transaction submitted: ${tx.hash}. Waiting for confirmation...`, "PENDING");

        const receipt = await tx.wait();
        await this.log(`SUCCESS! Claimed ${formatted} INC into Founder Treasury EOA. Gas Used: ${receipt!.gasUsed}`, "SUCCESS");
      } else {
        await this.log("Vesting Check: No unlocked tokens available at this time.", "STATUS");
      }
    } catch (error: any) {
      await this.log(`Vesting Claim Check Error: ${error.message}`, "ERROR");
    }
  }

  /**
   * Task 2: Auto-Maintain Staking Reward Liquidity
   */
  async maintainStakingRewards() {
    if (!STAKING_ADDRESS) return;
    try {
      const finishAt = await this.stakingContract.finishAt();
      const now = Math.floor(Date.now() / 1000);

      if (Number(finishAt) === 0) {
        await this.log("Staking: No active reward cycle. Skipping refill.", "STATUS");
        return;
      }

      if (now >= Number(finishAt) - 86400) {
        await this.log("Staking Reward Cycle Expiring Soon! Refilling Staking Pool automatically...", "WARNING");

        const refillAmount = ethers.parseEther("1000000000"); // 1 Billion INC per cycle
        const tx = await this.vaultContract.refillStakingPool(refillAmount);
        await tx.wait();

        await this.log(`Successfully refilled 1 Billion INC into Staking Pool! TX: ${tx.hash}`, "SUCCESS");
      } else {
        const daysLeft = Math.ceil((Number(finishAt) - now) / 86400);
        await this.log(`Staking Check: Reward cycle has ${daysLeft} days remaining.`, "STATUS");
      }
    } catch (error: any) {
      await this.log(`Staking Maintenance Error: ${error.message}`, "ERROR");
    }
  }

  /**
   * Task 3: Automated Annual Q3 Pre-Holiday Halving Execution
   */
  async checkAndTriggerHalving() {
    try {
      const lastHalving = await this.tokenContract.lastHalvingTimestamp();
      const now = Math.floor(Date.now() / 1000);
      const oneYear = 365 * 24 * 60 * 60;
      const currentMonth = new Date().getMonth() + 1; // 1-12

      if (currentMonth === 9 && now >= Number(lastHalving) + oneYear) {
        await this.log("September halving epoch reached! Triggering pre-holiday halving...", "ACTION");

        const tx = await this.tokenContract.triggerPreHolidayHalving();
        await tx.wait();

        const newRate = await this.tokenContract.currentEmissionRate();
        await this.log(`Halving executed! New emission rate: ${newRate}. TX: ${tx.hash}`, "SUCCESS");
      } else {
        await this.log("Halving Check: Not yet time for halving.", "STATUS");
      }
    } catch (error: any) {
      await this.log(`Halving Check Error: ${error.message}`, "ERROR");
    }
  }

  /**
   * Task 4: Auto-Collect Protocol Fees
   */
  async checkAndCollectFees() {
    try {
      const feeBalance = await this.tokenContract.balanceOf(FEE_WALLET);
      const threshold = ethers.parseEther("1000000"); // 1M INC threshold

      if (feeBalance > threshold) {
        await this.log(`Fee wallet has ${ethers.formatEther(feeBalance)} INC. Auto-collecting fees...`, "ACTION");
        await this.log("Fee collection requires manual disbursement from vault. Skipping auto-transfer.", "STATUS");
      } else {
        await this.log(`Fee Check: Fee wallet balance is ${ethers.formatEther(feeBalance)} INC (below threshold).`, "STATUS");
      }
    } catch (error: any) {
      await this.log(`Fee Collection Error: ${error.message}`, "ERROR");
    }
  }

  /**
   * Master Agent Execution Loop
   */
  async startAutonomousDaemon(intervalMinutes = 30) {
    await this.log(`Starting Founder Autonomous Agent Daemon on BSC (Loop: every ${intervalMinutes} mins)...`, "INIT");
    await this.log(`Master Founder EOA Address: ${this.wallet.address}`, "INIT");

    const executeTasks = async () => {
      if (this.isProcessing) return;
      this.isProcessing = true;

      await this.log("--- Executing Scheduled Autonomous Checks ---", "CRON");
      await this.checkAndClaimVesting();
      await this.maintainStakingRewards();
      await this.checkAndTriggerHalving();
      await this.checkAndCollectFees();
      await this.log("--- Autonomous Checks Complete ---", "CRON");

      this.isProcessing = false;
    };

    await executeTasks();
    setInterval(executeTasks, intervalMinutes * 60 * 1000);
  }
}

if (require.main === module) {
  const agent = new FounderAutonomousAgent();
  agent.startAutonomousDaemon(30).catch(console.error);
}

module.exports = FounderAutonomousAgent;
