import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("---------------------------------------------------------");
  console.log("Deploying Consolidated Incentives (INC) System on BSC");
  console.log("Founder / Deployer Address:", deployer.address);
  console.log("---------------------------------------------------------");

  const DECIMALS = 18;
  const toWei = (amount: string) => ethers.parseUnits(amount, DECIMALS);

  // 1. Deploy IncentiveToken (1 Trillion Supply)
  console.log("\n1. Deploying IncentiveToken...");
  const IncentiveToken = await ethers.getContractFactory("IncentiveToken");
  const token = await IncentiveToken.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`>>> IncentiveToken deployed at: ${tokenAddress}`);

  // 2. Deploy FounderMasterVault
  console.log("\n2. Deploying FounderMasterVault...");
  const FounderMasterVault = await ethers.getContractFactory("FounderMasterVault");
  const vault = await FounderMasterVault.deploy(tokenAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`>>> FounderMasterVault deployed at: ${vaultAddress}`);

  // 3. Deploy IncentiveVesting
  console.log("\n3. Deploying IncentiveVesting...");
  const IncentiveVesting = await ethers.getContractFactory("IncentiveVesting");
  const vesting = await IncentiveVesting.deploy(tokenAddress, deployer.address);
  await vesting.waitForDeployment();
  const vestingAddress = await vesting.getAddress();
  console.log(`>>> IncentiveVesting deployed at: ${vestingAddress}`);

  // 4. Deploy IncentiveGamingStaking
  console.log("\n4. Deploying IncentiveGamingStaking...");
  const IncentiveGamingStaking = await ethers.getContractFactory("IncentiveGamingStaking");
  const staking = await IncentiveGamingStaking.deploy(tokenAddress);
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  console.log(`>>> IncentiveGamingStaking deployed at: ${stakingAddress}`);

  // 5. Link vesting to vault
  console.log("\n5. Linking Vesting Contract to Vault...");
  const linkTx1 = await vault.setVestingContract(vestingAddress);
  await linkTx1.wait();
  console.log(">>> Vesting contract linked!");

  // 6. Link staking to vault
  console.log("\n6. Linking Staking Contract to Vault...");
  const linkTx2 = await vault.setStakingContract(stakingAddress);
  await linkTx2.wait();
  console.log(">>> Staking contract linked!");

  // 7. Initialize reserves (200B staking, 150B marketing, 100B airdrop)
  console.log("\n7. Initializing Ecosystem Reserves...");
  const initTx = await vault.initializeReserves(
    toWei("200000000000"),  // 200B
    toWei("150000000000"),  // 150B
    toWei("100000000000"),  // 100B
  );
  await initTx.wait();
  console.log(">>> Reserves initialized!");

  // 8. Transfer 450B INC to vault
  console.log("\n8. Transferring 450B INC to Vault...");
  const transferVaultTx = await token.transfer(vaultAddress, toWei("450000000000"));
  await transferVaultTx.wait();
  console.log(">>> 450B INC transferred to vault!");

  // 9. Transfer 250B INC to vesting
  console.log("\n9. Transferring 250B INC to Vesting...");
  const transferVestingTx = await token.transfer(vestingAddress, toWei("250000000000"));
  await transferVestingTx.wait();
  console.log(">>> 250B INC transferred to vesting!");

  // 10. Transfer 1B INC to staking + start first reward cycle
  console.log("\n10. Transferring 1B INC to Staking + starting first reward cycle...");
  const transferStakingTx = await token.transfer(stakingAddress, toWei("1000000000"));
  await transferStakingTx.wait();
  const notifyTx = await staking.notifyRewardFromBalance(toWei("1000000000"));
  await notifyTx.wait();
  console.log(">>> 1B INC deposited to staking, first reward cycle started!");

  // 11. Log all addresses
  console.log("\n---------------------------------------------------------");
  console.log("CONSOLIDATED SYSTEM DEPLOYMENT COMPLETE!");
  console.log("---------------------------------------------------------");
  console.log("INC Token Address:       ", tokenAddress);
  console.log("Founder Vault Address:   ", vaultAddress);
  console.log("Vesting Address:         ", vestingAddress);
  console.log("Staking Address:         ", stakingAddress);
  console.log("---------------------------------------------------------");
  console.log("\nSave these addresses for the frontend and agent .env file:");
  console.log(`INC_TOKEN_ADDRESS=${tokenAddress}`);
  console.log(`MASTER_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`VESTING_ADDRESS=${vestingAddress}`);
  console.log(`STAKING_ADDRESS=${stakingAddress}`);
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
