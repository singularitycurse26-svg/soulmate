import { useState } from "react";
import { ethers } from "ethers";
import { motion, AnimatePresence } from "framer-motion";
import { IncentiveGamingStakingABI, IncentiveGamingStakingBytecode } from "@/contracts/IncentiveGamingStaking";
import incentivesCoin from "@/assets/incentives-coin.png";
import { useStore } from "@/lib/store";
import { authApi } from "@/lib/api";
import { saveWalletToVault } from "@/lib/vault";
import { cn, copyToClipboard } from "@/lib/utils";
import {
  Wallet as WalletIcon,
  Copy,
  Check,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  Fingerprint,
} from "lucide-react";

// --- Wallet Biometric Helpers ---

const WALLET_BIO_KEY = "soulmate_wallet_bio";

async function encryptWalletKey(privateKey: string, credentialId: ArrayBuffer): Promise<string> {
  const keyData = new TextEncoder().encode(privateKey);
  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    credentialId,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    keyData
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptWalletKey(encryptedB64: string, credentialId: ArrayBuffer): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    credentialId,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    data
  );
  return new TextDecoder().decode(decrypted);
}

function saveWalletBiometric(credentialIdB64: string, encryptedKey: string, address: string) {
  const entries = JSON.parse(localStorage.getItem(WALLET_BIO_KEY) || "[]");
  const idx = entries.findIndex((e: any) => e.credential_id === credentialIdB64);
  const entry = { credential_id: credentialIdB64, encrypted_key: encryptedKey, address, saved_at: new Date().toISOString() };
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  localStorage.setItem(WALLET_BIO_KEY, JSON.stringify(entries));
}

function getWalletBiometricEntries(): Array<{ credential_id: string; encrypted_key: string; address: string }> {
  try {
    return JSON.parse(localStorage.getItem(WALLET_BIO_KEY) || "[]");
  } catch {
    return [];
  }
}

function hasWalletBiometric(): boolean {
  return getWalletBiometricEntries().length > 0;
}

function walletFromTwoWords(word1: string, word2: string): ethers.Wallet {
  const combined = (word1.trim().toLowerCase() + " " + word2.trim().toLowerCase());
  const hash = ethers.keccak256(ethers.toUtf8Bytes(combined));
  return new ethers.Wallet(hash);
}

async function registerAuthFingerprint(): Promise<boolean> {
  try {
    const beginResp = await authApi.webauthnRegisterBegin();
    const challenge = Uint8Array.from(atob(beginResp.challenge), (c: string) => c.charCodeAt(0));
    const userId = Uint8Array.from(beginResp.user.id, (c: string) => c.charCodeAt(0));

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: beginResp.rp,
        user: { ...beginResp.user, id: userId },
        pubKeyCredParams: beginResp.pubKeyCredParams,
        authenticatorSelection: beginResp.authenticatorSelection,
        timeout: beginResp.timeout || 60000,
        attestation: beginResp.attestation || "none",
      },
    }) as PublicKeyCredential;

    if (!credential) return false;

    const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
    const pubKey = btoa(String.fromCharCode(...new Uint8Array((credential.response as AuthenticatorAttestationResponse).attestationObject)));

    const result = await authApi.webauthnRegisterComplete(credId, pubKey, 0);
    if (result.status === "registered") {
      localStorage.setItem("fingerprint_registered", "true");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function registerWalletFingerprint(): Promise<{ credentialIdB64: string; rawId: ArrayBuffer } | null> {
  if (!window.PublicKeyCredential) throw new Error("Biometric authentication not available on this device");

  const challenge = window.crypto.getRandomValues(new Uint8Array(32));
  const userId = window.crypto.getRandomValues(new Uint8Array(16));

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Soulmate OS Wallet" },
      user: { id: userId, name: "wallet", displayName: "Soulmate OS Wallet" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
      },
      timeout: 60000,
      attestation: "none",
    },
  }) as PublicKeyCredential;

  if (!credential) return null;

  const credentialIdB64 = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
  return { credentialIdB64, rawId: credential.rawId };
}

async function authWalletFingerprint(credentialIdB64?: string): Promise<{ credentialIdB64: string; rawId: ArrayBuffer } | null> {
  if (!window.PublicKeyCredential) throw new Error("Biometric authentication not available on this device");

  const challenge = window.crypto.getRandomValues(new Uint8Array(32));
  const allowCredentials: PublicKeyCredentialDescriptor[] = [];
  if (credentialIdB64) {
    const rawId = Uint8Array.from(atob(credentialIdB64), c => c.charCodeAt(0));
    allowCredentials.push({ type: "public-key", id: rawId });
  }

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: window.location.hostname,
      timeout: 60000,
      userVerification: "required",
      allowCredentials,
    },
  }) as PublicKeyCredential;

  if (!assertion) return null;

  const resultIdB64 = btoa(String.fromCharCode(...new Uint8Array(assertion.rawId)));
  return { credentialIdB64: resultIdB64, rawId: assertion.rawId };
}

export function WalletCreateView() {
  const { view, setView, setWallet, showAlert, isAuthenticated } = useStore();
  const [step, setStep] = useState<"generate" | "confirm">("generate");
  const [passphrase, setPassphrase] = useState("");
  const [word1, setWord1] = useState("");
  const [word2, setWord2] = useState("");
  const [address, setAddress] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [showPrivKey, setShowPrivKey] = useState(false);
  const [confirmCheck, setConfirmCheck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioEnrolling, setBioEnrolling] = useState(false);

  const handleCopy = (text: string, label: string) => {
    copyToClipboard(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const generateWallet = async () => {
    const w1 = word1.trim();
    const w2 = word2.trim();
    if (!w1 || !w2) {
      showAlert("danger", "Please enter both words for your passphrase");
      return;
    }
    if (w1.length < 3 || w2.length < 3) {
      showAlert("danger", "Each word must be at least 3 characters");
      return;
    }
    setBusy(true);
    try {
      const wallet = walletFromTwoWords(w1, w2);
      setPassphrase(w1 + " " + w2);
      setAddress(wallet.address);
      setPrivateKey(wallet.privateKey);
      setStep("confirm");
    } catch (e: any) {
      showAlert("danger", "Failed to generate wallet: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const importWallet = async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) {
      showAlert("danger", "Please enter your 2-word passphrase or private key above");
      return;
    }
    setBusy(true);
    try {
      let wallet: ethers.Wallet;
      const words = trimmed.split(/\s+/);

      if (words.length === 2 && words[0].length >= 3 && words[1].length >= 3) {
        wallet = walletFromTwoWords(words[0], words[1]);
      } else if (trimmed.startsWith("0x") && trimmed.length === 66) {
        wallet = new ethers.Wallet(trimmed);
      } else if (trimmed.length === 64) {
        wallet = new ethers.Wallet("0x" + trimmed);
      } else {
        throw new Error("Enter your 2-word passphrase or private key (0x...)");
      }

      setWallet(wallet.address, wallet.privateKey);
      saveWalletToVault(wallet.address, wallet.privateKey);
      showAlert("success", `Wallet imported: ${wallet.address.slice(0, 8)}...${wallet.address.slice(-6)}`);
      setView("app");
    } catch (e: any) {
      showAlert("danger", "Import failed: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const finalizeWallet = () => {
    if (!confirmCheck) {
      showAlert("danger", "Please confirm you've saved your passphrase");
      return;
    }

    setWallet(address, privateKey);
    saveWalletToVault(address, privateKey);
    showAlert("success", "Wallet ready! Address saved.");
    setView("app");
  };

  const enableFingerprint = async () => {
    if (!window.PublicKeyCredential) {
      // No biometric support — save wallet for auto-login on this device
      localStorage.setItem("fingerprint_registered", "true");
      localStorage.setItem("remember_me_device", "true");
      setBioEnabled(true);
      showAlert("success", "Wallet saved for auto-login on this device!");
      return;
    }
    setBioEnrolling(true);
    try {
      const result = await registerWalletFingerprint();
      if (!result) {
        showAlert("info", "Fingerprint enrollment was cancelled");
        return;
      }
      const encryptedKey = await encryptWalletKey(privateKey, result.rawId);
      saveWalletBiometric(result.credentialIdB64, encryptedKey, address);
      setBioEnabled(true);
      // Also register auth fingerprint so fingerprint works for app login too
      await registerAuthFingerprint();
      showAlert("success", "Fingerprint enabled for wallet & login! Use fingerprint for all future access.");
    } catch (e: any) {
      if (e.name === "NotAllowedError") {
        showAlert("info", "Fingerprint enrollment was cancelled");
      } else {
        showAlert("danger", e.message || "Failed to enable fingerprint");
      }
    } finally {
      setBioEnrolling(false);
    }
  };

  // Import wallet view
  if (view === "import-wallet") {
    return <ImportWalletView onImport={importWallet} onBack={() => setView("create-wallet")} busy={busy} />;
  }

  return (
    <>
      <AlertContainer />
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <AnimatePresence mode="wait">
          {/* Step 1: Generate — pick 2 words */}
          {step === "generate" && (
            <motion.div
              key="generate"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-sm card text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4 relative">
                <WalletIcon className="w-8 h-8 text-accent" />
                <img src={incentivesCoin} alt="INC" className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full border-2 border-bg object-cover" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Create Wallet</h2>
              <p className="text-muted text-sm mb-6">
                Pick two words you'll remember. These create your wallet — write them down, they're your only backup.
              </p>

              <div className="space-y-3 mb-6">
                <input
                  type="text"
                  value={word1}
                  onChange={(e) => setWord1(e.target.value)}
                  placeholder="First word"
                  className="w-full text-center text-lg font-medium"
                  autoComplete="off"
                />
                <input
                  type="text"
                  value={word2}
                  onChange={(e) => setWord2(e.target.value)}
                  placeholder="Second word"
                  className="w-full text-center text-lg font-medium"
                  autoComplete="off"
                  onKeyDown={(e) => e.key === "Enter" && generateWallet()}
                />
              </div>

              <button onClick={generateWallet} disabled={busy || !word1.trim() || !word2.trim()} className="btn-primary w-full mb-3 flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {busy ? "Generating..." : "Generate Wallet"}
              </button>

              <button onClick={() => setView("import-wallet")} className="btn-secondary w-full mb-3 flex items-center justify-center gap-2">
                <KeyRound className="w-4 h-4" /> Import Existing Wallet
              </button>

              {hasWalletBiometric() && (
                <button onClick={() => setView("import-wallet")} className="text-accent text-xs hover:text-accent/80 transition-colors w-full text-center mb-2 flex items-center justify-center gap-1">
                  <Fingerprint className="w-3.5 h-3.5" /> Fingerprint unlock available
                </button>
              )}

              {isAuthenticated && (
                <button onClick={() => setView("app")} className="text-muted text-xs hover:text-white transition-colors w-full text-center">
                  Skip for now →
                </button>
              )}
            </motion.div>
          )}

          {/* Step 2: Confirm */}
          {step === "confirm" && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full max-w-sm card text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
                <WalletIcon className="w-8 h-8 text-success" />
              </div>
              <h2 className="text-xl font-bold mb-2">Confirm Wallet</h2>
              <p className="text-muted text-sm mb-4">
                Your wallet is ready. Confirm below to start using Soulmate OS.
              </p>

              <div className="bg-bg-alt rounded-lg p-3 mb-4 text-left">
                <p className="text-xs text-muted mb-1">Your Passphrase:</p>
                <p className="text-lg font-bold text-accent break-all select-text" style={{ userSelect: "text" }}>{passphrase}</p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleCopy(passphrase, "passphrase")}
                    className="text-xs flex items-center gap-1 text-muted hover:text-white"
                  >
                    {copied === "passphrase" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                    Copy
                  </button>
                  <button
                    onClick={() => handleCopy(address, "address")}
                    className="text-xs flex items-center gap-1 text-muted hover:text-white"
                  >
                    {copied === "address" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                    Copy Address
                  </button>
                </div>
              </div>

              <div className="bg-bg-alt rounded-lg p-3 mb-4 text-left">
                <p className="text-xs text-muted mb-1">Wallet Address:</p>
                <p className="font-mono text-sm break-all text-accent">{address}</p>
              </div>

              <label className="flex items-start gap-3 mb-4 text-left cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmCheck}
                  onChange={(e) => setConfirmCheck(e.target.checked)}
                  className="mt-1 accent-accent w-4 h-4"
                />
                <span className="text-sm text-muted">
                  I have saved my 2-word passphrase and understand it cannot be recovered if lost.
                </span>
              </label>

              {/* Fingerprint enrollment */}
              {window.PublicKeyCredential && (
                <div className="bg-bg-alt rounded-lg p-3 mb-4 text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Fingerprint className="w-5 h-5 text-accent" />
                      <div>
                        <p className="text-sm font-medium">Fingerprint Unlock</p>
                        <p className="text-xs text-muted">
                          {bioEnabled ? "Enabled — you can import with fingerprint" : "Enable fingerprint to unlock wallet without typing phrase"}
                        </p>
                      </div>
                    </div>
                    {bioEnabled ? (
                      <Check className="w-5 h-5 text-success" />
                    ) : (
                      <button
                        onClick={enableFingerprint}
                        disabled={bioEnrolling}
                        className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors flex items-center gap-1"
                      >
                        {bioEnrolling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Fingerprint className="w-3 h-3" />}
                        {bioEnrolling ? "Scanning..." : "Enable"}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <button onClick={finalizeWallet} disabled={!confirmCheck} className="btn-primary w-full mb-3">
                Enter Soulmate OS <ArrowRight className="w-4 h-4 inline" />
              </button>
              <button onClick={() => setStep("generate")} className="btn-ghost w-full text-sm flex items-center justify-center gap-1">
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

function AlertContainer() {
  return null;
}

function ImportWalletView({ onImport, onBack, busy }: { onImport: (input: string) => void; onBack: () => void; busy: boolean }) {
  const [input, setInput] = useState("");
  const [importMode, setImportMode] = useState<"phrase" | "fingerprint">("phrase");
  const [bioBusy, setBioBusy] = useState(false);
  const [bioStatus, setBioStatus] = useState("");
  const { setWallet, showAlert } = useStore();
  const bioEntries = hasWalletBiometric();

  const handleFingerprintImport = async () => {
    // If no biometric support, check for saved wallet on device
    if (!window.PublicKeyCredential) {
      const savedAddr = localStorage.getItem("wallet_address");
      const savedKey = localStorage.getItem("wallet_key");
      if (savedAddr && savedKey) {
        setWallet(savedAddr, savedKey);
        saveWalletToVault(savedAddr, savedKey);
        showAlert("success", `Wallet restored: ${savedAddr.slice(0, 8)}...${savedAddr.slice(-6)}`);
        useStore.getState().setView("app");
      } else {
        showAlert("danger", "No saved wallet found on this device. Use the 2-word passphrase to import.");
      }
      return;
    }

    setBioBusy(true);
    setBioStatus("Scan your fingerprint to unlock your wallet...");
    try {
      const entries = getWalletBiometricEntries();
      if (entries.length === 0) {
        // No biometric entries but wallet might be saved on device
        const savedAddr = localStorage.getItem("wallet_address");
        const savedKey = localStorage.getItem("wallet_key");
        if (savedAddr && savedKey) {
          setWallet(savedAddr, savedKey);
          saveWalletToVault(savedAddr, savedKey);
          showAlert("success", `Wallet restored: ${savedAddr.slice(0, 8)}...${savedAddr.slice(-6)}`);
          useStore.getState().setView("app");
        } else {
          showAlert("danger", "No saved wallet found. Use the 2-word passphrase to import.");
        }
        setBioBusy(false);
        setBioStatus("");
        return;
      }

      // Try each stored credential
      let unlocked = false;
      for (const entry of entries) {
        try {
          const result = await authWalletFingerprint(entry.credential_id);
          if (!result) continue;

          const decryptedKey = await decryptWalletKey(entry.encrypted_key, result.rawId);
          if (decryptedKey) {
            const wallet = new ethers.Wallet(decryptedKey);
            setWallet(wallet.address, decryptedKey);
            saveWalletToVault(wallet.address, decryptedKey);
            showAlert("success", `Wallet unlocked: ${wallet.address.slice(0, 8)}...${wallet.address.slice(-6)}`);
            useStore.getState().setView("app");
            unlocked = true;
            break;
          }
        } catch (err: any) {
          // Try next credential
          continue;
        }
      }

      if (!unlocked) {
        // Fallback to saved wallet on device
        const savedAddr = localStorage.getItem("wallet_address");
        const savedKey = localStorage.getItem("wallet_key");
        if (savedAddr && savedKey) {
          setWallet(savedAddr, savedKey);
          saveWalletToVault(savedAddr, savedKey);
          showAlert("success", `Wallet restored: ${savedAddr.slice(0, 8)}...${savedAddr.slice(-6)}`);
          useStore.getState().setView("app");
        } else {
          showAlert("danger", "Fingerprint did not match. Try 2-word passphrase import.");
        }
      }
    } catch (e: any) {
      if (e.name === "NotAllowedError") {
        showAlert("info", "Fingerprint authentication was cancelled");
      } else {
        showAlert("danger", e.message || "Fingerprint authentication failed");
      }
    } finally {
      setBioBusy(false);
      setBioStatus("");
    }
  };

  const handleFingerprintRegister = async () => {
    const trimmed = input.trim();
    if (!trimmed) {
      showAlert("danger", "Please enter your 2-word passphrase or private key above");
      return;
    }

    setBioBusy(true);
    setBioStatus("Importing wallet...");
    try {
      // Parse the wallet from 2-word passphrase or private key
      let wallet: ethers.Wallet;
      const words = trimmed.split(/\s+/);

      if (words.length === 2 && words[0].length >= 3 && words[1].length >= 3) {
        wallet = walletFromTwoWords(words[0], words[1]);
      } else if (trimmed.startsWith("0x") && trimmed.length === 66) {
        wallet = new ethers.Wallet(trimmed);
      } else if (trimmed.length === 64) {
        wallet = new ethers.Wallet("0x" + trimmed);
      } else {
        throw new Error("Enter your 2-word passphrase or private key (0x...)");
      }

      // Save wallet first so it works regardless of biometric support
      setWallet(wallet.address, wallet.privateKey);
      saveWalletToVault(wallet.address, wallet.privateKey);

      if (window.PublicKeyCredential) {
        // Register fingerprint biometric
        setBioStatus("Scan your fingerprint to secure this wallet...");
        const result = await registerWalletFingerprint();
        if (result) {
          const encryptedKey = await encryptWalletKey(wallet.privateKey, result.rawId);
          saveWalletBiometric(result.credentialIdB64, encryptedKey, wallet.address);

          // Also register auth fingerprint so fingerprint works for app login too
          setBioStatus("Registering fingerprint for login...");
          await registerAuthFingerprint();
          showAlert("success", `Wallet imported & fingerprint enabled for wallet & login: ${wallet.address.slice(0, 8)}...${wallet.address.slice(-6)}`);
        } else {
          showAlert("success", `Wallet imported: ${wallet.address.slice(0, 8)}...${wallet.address.slice(-6)}`);
        }
      } else {
        // No biometric support — save wallet for auto-login on this device
        localStorage.setItem("fingerprint_registered", "true");
        localStorage.setItem("remember_me_device", "true");
        showAlert("success", `Wallet imported & saved for auto-login: ${wallet.address.slice(0, 8)}...${wallet.address.slice(-6)}`);
      }

      useStore.getState().setView("app");
    } catch (e: any) {
      if (e.name === "NotAllowedError") {
        showAlert("info", "Fingerprint enrollment was cancelled");
      } else {
        showAlert("danger", e.message || "Failed to import wallet");
      }
    } finally {
      setBioBusy(false);
      setBioStatus("");
    }
  };

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm card"
        >
          <div className="text-center mb-4">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
              <KeyRound className="w-6 h-6 text-accent" />
            </div>
            <h2 className="text-xl font-bold">Import Wallet</h2>
            <p className="text-muted text-xs mt-1">Choose how to import your wallet</p>
          </div>

          {/* Import method tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setImportMode("phrase")}
              className={cn(
                "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
                importMode === "phrase" ? "bg-accent text-white" : "bg-bg-alt text-muted hover:text-white"
              )}
            >
              <KeyRound className="w-4 h-4" /> Phrase / Key
            </button>
            <button
              onClick={() => setImportMode("fingerprint")}
              className={cn(
                "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
                importMode === "fingerprint" ? "bg-accent text-white" : "bg-bg-alt text-muted hover:text-white"
              )}
            >
              <Fingerprint className="w-4 h-4" /> Fingerprint
            </button>
          </div>

          {/* Phrase / Key import */}
          {importMode === "phrase" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Enter your 2-word passphrase or private key (0x...) here..."
                className="w-full mb-2 h-28 font-mono text-sm"
                style={{ userSelect: "text" }}
              />

              <p className="text-xs text-muted mb-3 text-center">
                Enter your saved 2-word passphrase or private key above, then click Import.
              </p>

              <button
                onClick={() => onImport(input)}
                disabled={busy}
                className="btn-primary w-full mb-3 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {busy ? "Importing..." : "Import Wallet"}
              </button>
            </motion.div>
          )}

          {/* Fingerprint import */}
          {importMode === "fingerprint" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              {bioEntries ? (
                /* Flow 1: Existing biometric wallet — unlock with fingerprint */
                <div className="py-6 flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center">
                    <Fingerprint className={cn("w-10 h-10 text-accent", bioBusy && "animate-pulse")} />
                  </div>
                  <p className="text-sm text-muted">
                    {bioBusy ? bioStatus : "Tap below and scan your fingerprint to unlock your wallet."}
                  </p>
                  <button
                    onClick={handleFingerprintImport}
                    disabled={bioBusy}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {bioBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Fingerprint className="w-5 h-5" />}
                    {bioBusy ? "Scanning..." : "Unlock with Fingerprint"}
                  </button>
                </div>
              ) : !window.PublicKeyCredential ? (
                /* Flow: No biometric support on this device — enter passphrase to save for auto-login */
                <div className="py-4 flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
                    <Fingerprint className={cn("w-8 h-8 text-accent", bioBusy && "animate-pulse")} />
                  </div>
                  <p className="text-sm text-muted">
                    Biometric scanner not available on this device. Enter your 2-word passphrase below to save your wallet for auto-login on this device.
                  </p>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Enter your 2-word passphrase or private key (0x...) here..."
                    className="w-full h-28 font-mono text-sm"
                    style={{ userSelect: "text" }}
                  />
                  <button
                    onClick={handleFingerprintRegister}
                    disabled={bioBusy || !input.trim()}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {bioBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Fingerprint className="w-5 h-5" />}
                    {bioBusy ? bioStatus || "Saving..." : "Save for Auto-Login"}
                  </button>
                </div>
              ) : (
                /* Flow 2: No biometric wallet yet — enter phrase + register fingerprint */
                <div className="py-4 flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
                    <Fingerprint className={cn("w-8 h-8 text-accent", bioBusy && "animate-pulse")} />
                  </div>
                  <p className="text-sm text-muted">
                    Enter your 2-word passphrase or private key below, then scan your fingerprint to securely import and save your wallet for biometric access.
                  </p>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Enter your 2-word passphrase or private key (0x...) here..."
                    className="w-full h-28 font-mono text-sm"
                    style={{ userSelect: "text" }}
                  />
                  <button
                    onClick={handleFingerprintRegister}
                    disabled={bioBusy || !input.trim()}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {bioBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Fingerprint className="w-5 h-5" />}
                    {bioBusy ? bioStatus || "Scanning..." : "Import with Fingerprint"}
                  </button>
                </div>
              )}
            </motion.div>
          )}

          <button onClick={onBack} className="btn-ghost w-full text-sm flex items-center justify-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
        </motion.div>
      </div>
    </>
  );
}
