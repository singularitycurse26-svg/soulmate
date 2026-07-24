import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

const RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org/";
const INC_TOKEN_ADDRESS = process.env.INC_TOKEN_ADDRESS || "";
const STAKING_ADDRESS = process.env.STAKING_ADDRESS || "";

const SOULMATE_API_URL = process.env.SOULMATE_API_URL || "https://191.44.121.29.sslip.io";
const SOULMATE_API_TOKEN = process.env.SOULMATE_API_TOKEN || "soulmate_wallet_2024";

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "incentives_cache.json");

const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

interface CachedData {
  lastPriceUpdate: number;
  price: { usd: number; change24h: number };
  volume24h: number;
  marketCap: number;
  priceHistory: { timestamp: number; price: number }[];
  dailyStats: { date: string; buys: number; sells: number; volume: number }[];
  stakingLeaderboard: { address: string; amount: string; lastStake: number }[];
  lastEventBlock: number;
  lastStakingEventBlock: number;
}

function loadCache(): CachedData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    }
  } catch {}
  return {
    lastPriceUpdate: 0,
    price: { usd: 0, change24h: 0 },
    volume24h: 0,
    marketCap: 0,
    priceHistory: [],
    dailyStats: [],
    stakingLeaderboard: [],
    lastEventBlock: 0,
    lastStakingEventBlock: 0,
  };
}

function saveCache(data: CachedData) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

class IncentivesDataCollector {
  private provider: ethers.JsonRpcProvider;
  private cache: CachedData;
  private isProcessing = false;

  constructor() {
    if (!INC_TOKEN_ADDRESS) throw new Error("INC_TOKEN_ADDRESS required");
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    this.cache = loadCache();
  }

  private log(message: string, type = "INFO") {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [DATA-COLLECTOR-${type}] ${message}`);
  }

  /**
   * Fetch INC price from DexScreener API
   */
  async fetchPrice() {
    try {
      const resp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${INC_TOKEN_ADDRESS}`);
      const data = await resp.json() as any;

      if (data.pairs && data.pairs.length > 0) {
        const pair = data.pairs[0];
        const price = parseFloat(pair.priceUsd || "0");
        const change24h = parseFloat(pair.priceChange?.h24 || "0");
        const volume24h = parseFloat(pair.volume?.h24 || "0");
        const marketCap = parseFloat(pair.fdv || "0");

        this.cache.price = { usd: price, change24h };
        this.cache.volume24h = volume24h;
        this.cache.marketCap = marketCap;
        this.cache.lastPriceUpdate = Date.now();

        this.cache.priceHistory.push({ timestamp: Date.now(), price });
        if (this.cache.priceHistory.length > 1008) {
          this.cache.priceHistory = this.cache.priceHistory.slice(-1008);
        }

        this.log(`Price updated: $${price} (${change24h > 0 ? "+" : ""}${change24h}% 24h)`, "PRICE");
      }
    } catch (error: any) {
      this.log(`Price fetch error: ${error.message}`, "ERROR");
    }
  }

  /**
   * Index INC Transfer events to categorize buys/sells
   */
  async indexTransferEvents() {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = this.cache.lastEventBlock > 0 ? this.cache.lastEventBlock + 1 : currentBlock - 5000;
      const toBlock = Math.min(fromBlock + 5000, currentBlock);

      if (fromBlock >= toBlock) return;

      const tokenContract = new ethers.Contract(INC_TOKEN_ADDRESS, [
        "event Transfer(address indexed from, address indexed to, uint256 value)",
      ], this.provider);

      const events = await tokenContract.queryFilter(tokenContract.filters.Transfer(), fromBlock, toBlock);

      const today = new Date().toISOString().split("T")[0];
      let todayStats = this.cache.dailyStats.find(d => d.date === today);
      if (!todayStats) {
        todayStats = { date: today, buys: 0, sells: 0, volume: 0 };
        this.cache.dailyStats.push(todayStats);
        if (this.cache.dailyStats.length > 30) {
          this.cache.dailyStats = this.cache.dailyStats.slice(-30);
        }
      }

      for (const event of events) {
        const amount = parseFloat(ethers.formatEther(event.args[2]));
        todayStats.volume += amount;
        if (event.args[0] === "0x0000000000000000000000000000000000000000") {
          todayStats.buys += amount;
        } else if (event.args[1] === "0x0000000000000000000000000000000000000000") {
          todayStats.sells += amount;
        }
      }

      this.cache.lastEventBlock = toBlock;
      this.log(`Indexed ${events.length} transfer events (blocks ${fromBlock}-${toBlock})`, "INDEX");
    } catch (error: any) {
      this.log(`Transfer indexing error: ${error.message}`, "ERROR");
    }
  }

  /**
   * Index staking events to build leaderboard
   */
  async indexStakingEvents() {
    if (!STAKING_ADDRESS) return;
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = this.cache.lastStakingEventBlock > 0 ? this.cache.lastStakingEventBlock + 1 : currentBlock - 10000;
      const toBlock = Math.min(fromBlock + 5000, currentBlock);

      if (fromBlock >= toBlock) return;

      const stakingContract = new ethers.Contract(STAKING_ADDRESS, [
        "event Staked(address indexed user, uint256 amount)",
        "event Withdrawn(address indexed user, uint256 amount)",
      ], this.provider);

      const stakeEvents = await stakingContract.queryFilter(stakingContract.filters.Staked(), fromBlock, toBlock);
      const withdrawEvents = await stakingContract.queryFilter(stakingContract.filters.Withdrawn(), fromBlock, toBlock);

      const leaderboard = new Map<string, bigint>();

      for (const event of stakeEvents) {
        const user = event.args[0] as string;
        const amount = event.args[1] as bigint;
        leaderboard.set(user, (leaderboard.get(user) || 0n) + amount);
      }

      for (const event of withdrawEvents) {
        const user = event.args[0] as string;
        const amount = event.args[1] as bigint;
        const current = leaderboard.get(user) || 0n;
        leaderboard.set(user, current > amount ? current - amount : 0n);
      }

      const sorted = Array.from(leaderboard.entries())
        .map(([address, amount]) => ({ address, amount: amount.toString(), lastStake: Date.now() }))
        .sort((a, b) => BigInt(b.amount) - BigInt(a.amount))
        .slice(0, 20);

      this.cache.stakingLeaderboard = sorted;
      this.cache.lastStakingEventBlock = toBlock;
      this.log(`Staking leaderboard updated: ${sorted.length} entries`, "STAKING");
    } catch (error: any) {
      this.log(`Staking indexing error: ${error.message}`, "ERROR");
    }
  }

  async startCollector() {
    this.log("Starting Incentives Data Collector...", "INIT");

    const runAll = async () => {
      if (this.isProcessing) return;
      this.isProcessing = true;

      await this.fetchPrice();
      await this.indexTransferEvents();
      await this.indexStakingEvents();
      saveCache(this.cache);

      this.isProcessing = false;
    };

    await runAll();

    setInterval(() => this.fetchPrice(), 60 * 1000);
    setInterval(() => { this.indexTransferEvents(); this.indexStakingEvents(); saveCache(this.cache); }, 5 * 60 * 1000);
  }
}

if (require.main === module) {
  const collector = new IncentivesDataCollector();
  collector.startCollector().catch(console.error);
}

module.exports = IncentivesDataCollector;
