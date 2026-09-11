import { useStore } from "@/lib/store";

// Default watch-only wallet address for Incentives Inc.
// This ensures every user always has a wallet address available.
// Users can import or create a full wallet (with private key) from the Wallet page.
const DEFAULT_WATCH_ADDRESS = "0x7Fb10c467319Dd4C9CEB3fcF018C2101a0842D8d";

export function ensureWalletExists(): void {
  const { walletAddress, setWallet } = useStore.getState();

  if (!walletAddress) {
    // Auto-create a watch-only wallet (no private key)
    // The wallet address is always present — users can upgrade to a full wallet later
    setWallet(DEFAULT_WATCH_ADDRESS, "");
    console.log("[Aceline] Auto-created watch-only Incentives wallet:", DEFAULT_WATCH_ADDRESS);
  }
}

// Call this on app load
export function initWalletAuto(): void {
  ensureWalletExists();
}
