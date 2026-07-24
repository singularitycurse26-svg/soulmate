import { run } from "hardhat";

async function main() {
  const addresses = {
    token: process.env.INC_TOKEN_ADDRESS,
    vault: process.env.MASTER_VAULT_ADDRESS,
    vesting: process.env.VESTING_ADDRESS,
    staking: process.env.STAKING_ADDRESS,
  };

  console.log("Verifying contracts on BSCScan...\n");

  if (addresses.token) {
    console.log("Verifying IncentiveToken...");
    try {
      await run("verify:verify", {
        address: addresses.token,
        constructorArguments: [process.env.FOUNDER_ADDRESS],
      });
      console.log(">>> IncentiveToken verified!");
    } catch (e: any) {
      console.log("Token verification failed:", e.message);
    }
  }

  if (addresses.vault) {
    console.log("Verifying FounderMasterVault...");
    try {
      await run("verify:verify", {
        address: addresses.vault,
        constructorArguments: [addresses.token],
      });
      console.log(">>> FounderMasterVault verified!");
    } catch (e: any) {
      console.log("Vault verification failed:", e.message);
    }
  }

  if (addresses.vesting) {
    console.log("Verifying IncentiveVesting...");
    try {
      await run("verify:verify", {
        address: addresses.vesting,
        constructorArguments: [addresses.token, process.env.FOUNDER_ADDRESS],
      });
      console.log(">>> IncentiveVesting verified!");
    } catch (e: any) {
      console.log("Vesting verification failed:", e.message);
    }
  }

  if (addresses.staking) {
    console.log("Verifying IncentiveGamingStaking...");
    try {
      await run("verify:verify", {
        address: addresses.staking,
        constructorArguments: [addresses.token],
      });
      console.log(">>> IncentiveGamingStaking verified!");
    } catch (e: any) {
      console.log("Staking verification failed:", e.message);
    }
  }

  console.log("\nVerification complete!");
}

main().catch((error) => {
  console.error("Verification failed:", error);
  process.exitCode = 1;
});
