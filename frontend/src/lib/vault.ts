import { useStore } from "@/lib/store";
import { authApi } from "@/lib/api";

export function saveAccountToVault(email: string, sessionToken: string, extra?: Record<string, string>) {
  const vaultData = {
    email,
    session_token: sessionToken,
    created_at: new Date().toISOString(),
    platform: "soulmate-os",
    ...extra,
  };

  try {
    const existing = JSON.parse(localStorage.getItem("soulmate_vault_accounts") || "[]");
    const idx = existing.findIndex((a: any) => a.email === email);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...vaultData };
    } else {
      existing.push(vaultData);
    }
    localStorage.setItem("soulmate_vault_accounts", JSON.stringify(existing));
  } catch (e) {
    console.error("Failed to save account to local vault:", e);
  }
}

export function getVaultAccounts(): Array<Record<string, any>> {
  try {
    return JSON.parse(localStorage.getItem("soulmate_vault_accounts") || "[]");
  } catch {
    return [];
  }
}

export function saveWalletToVault(walletAddress: string, walletKey: string) {
  try {
    const accounts = getVaultAccounts();
    const currentEmail = localStorage.getItem("auth_email");
    const idx = accounts.findIndex((a) => a.email === currentEmail);
    if (idx >= 0) {
      accounts[idx].wallet_address = walletAddress;
      accounts[idx].wallet_key = walletKey;
      accounts[idx].wallet_saved_at = new Date().toISOString();
      localStorage.setItem("soulmate_vault_accounts", JSON.stringify(accounts));
    }
  } catch (e) {
    console.error("Failed to save wallet to vault:", e);
  }
}
