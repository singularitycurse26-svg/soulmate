import { useState } from "react";
import { ethers } from "ethers";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";
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
} from "lucide-react";

export function WalletCreateView() {
  const { view, setView, setWallet, showAlert, isAuthenticated } = useStore();
  const [step, setStep] = useState<"generate" | "mnemonic" | "confirm">("generate");
  const [mnemonic, setMnemonic] = useState("");
  const [address, setAddress] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [showMnemonic, setShowMnemonic] = useState(true);
  const [showPrivKey, setShowPrivKey] = useState(false);
  const [confirmCheck, setConfirmCheck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    copyToClipboard(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const generateWallet = async () => {
    setBusy(true);
    try {
      const wallet = ethers.Wallet.createRandom();
      setMnemonic(wallet.mnemonic!.phrase);
      setAddress(wallet.address);
      setPrivateKey(wallet.privateKey);
      setStep("mnemonic");
    } catch (e: any) {
      showAlert("danger", "Failed to generate wallet: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const importWallet = async (input: string) => {
    setBusy(true);
    try {
      let wallet: ethers.Wallet;
      const trimmed = input.trim();

      if (trimmed.split(" ").length >= 12) {
        wallet = ethers.Wallet.fromPhrase(trimmed);
      } else if (trimmed.startsWith("0x") && trimmed.length === 66) {
        wallet = new ethers.Wallet(trimmed);
      } else if (trimmed.length === 64) {
        wallet = new ethers.Wallet("0x" + trimmed);
      } else {
        throw new Error("Invalid private key or mnemonic");
      }

      setMnemonic(wallet.mnemonic?.phrase || "");
      setAddress(wallet.address);
      setPrivateKey(wallet.privateKey);
      setStep("confirm");
    } catch (e: any) {
      showAlert("danger", "Import failed: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const finalizeWallet = () => {
    if (!confirmCheck) {
      showAlert("danger", "Please confirm you've saved your mnemonic");
      return;
    }

    setWallet(address, privateKey);
    saveWalletToVault(address, privateKey);
    showAlert("success", "Wallet ready! Address saved.");
    setView("app");
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
          {/* Step 1: Generate */}
          {step === "generate" && (
            <motion.div
              key="generate"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-sm card text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <WalletIcon className="w-8 h-8 text-accent" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Create Wallet</h2>
              <p className="text-muted text-sm mb-6">
                Generate a fresh BSC wallet with a new 12-word mnemonic phrase. Write it down — it's your only backup.
              </p>

              <button onClick={generateWallet} disabled={busy} className="btn-primary w-full mb-3 flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {busy ? "Generating..." : "Generate New Wallet"}
              </button>

              <button onClick={() => setView("import-wallet")} className="btn-secondary w-full mb-3 flex items-center justify-center gap-2">
                <KeyRound className="w-4 h-4" /> Import Existing Wallet
              </button>

              {isAuthenticated && (
                <button onClick={() => setView("app")} className="text-muted text-xs hover:text-white transition-colors w-full text-center">
                  Skip for now →
                </button>
              )}
            </motion.div>
          )}

          {/* Step 2: Show mnemonic */}
          {step === "mnemonic" && (
            <motion.div
              key="mnemonic"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full max-w-sm card"
            >
              <div className="text-center mb-4">
                <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle className="w-6 h-6 text-warning" />
                </div>
                <h2 className="text-xl font-bold">Save Your Mnemonic</h2>
                <p className="text-muted text-xs mt-1">
                  Write these 12 words down on paper. Never store them digitally. Never share them with anyone.
                </p>
              </div>

              {/* Mnemonic display */}
              <div className="bg-bg-alt rounded-xl p-4 mb-4 relative">
                <div className="grid grid-cols-3 gap-2">
                  {mnemonic.split(" ").map((word, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-xs text-muted w-5">{i + 1}.</span>
                      <span className={cn("text-sm font-medium", !showMnemonic && "blur-sm select-none")}>
                        {word}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setShowMnemonic(!showMnemonic)}
                  className="absolute top-2 right-2 text-muted hover:text-white p-1"
                >
                  {showMnemonic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Copy buttons */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => handleCopy(mnemonic, "mnemonic")}
                  className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm"
                >
                  {copied === "mnemonic" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  Copy Mnemonic
                </button>
                <button
                  onClick={() => handleCopy(address, "address")}
                  className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm"
                >
                  {copied === "address" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  Copy Address
                </button>
              </div>

              {/* Address display */}
              <div className="bg-bg-alt rounded-lg p-3 mb-4">
                <p className="text-xs text-muted mb-1">Your Wallet Address:</p>
                <p className="font-mono text-sm break-all text-accent">{address}</p>
              </div>

              {/* Private key (hidden by default) */}
              <div className="bg-bg-alt rounded-lg p-3 mb-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted">Private Key (keep secret):</p>
                  <button onClick={() => setShowPrivKey(!showPrivKey)} className="text-muted hover:text-white">
                    {showPrivKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className={cn("font-mono text-xs break-all", !showPrivKey && "blur-sm select-none")}>
                  {privateKey}
                </p>
              </div>

              <button onClick={() => setStep("confirm")} className="btn-primary w-full flex items-center justify-center gap-2">
                I've Saved It <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {/* Step 3: Confirm */}
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
                  I have saved my 12-word mnemonic phrase and understand it cannot be recovered if lost.
                </span>
              </label>

              <button onClick={finalizeWallet} disabled={!confirmCheck} className="btn-primary w-full mb-3">
                Enter Soulmate OS <ArrowRight className="w-4 h-4 inline" />
              </button>
              <button onClick={() => setStep("mnemonic")} className="btn-ghost w-full text-sm flex items-center justify-center gap-1">
                <ArrowLeft className="w-3 h-3" /> Back to mnemonic
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
            <p className="text-muted text-xs mt-1">Paste your 12-word mnemonic or private key</p>
          </div>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="abandon ability able about above absent absorb abstract absurd abuse access accident..."
            className="w-full mb-3 h-28 font-mono text-sm"
          />

          <button
            onClick={() => onImport(input)}
            disabled={busy || !input.trim()}
            className="btn-primary w-full mb-3 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {busy ? "Importing..." : "Import Wallet"}
          </button>

          <button onClick={onBack} className="btn-ghost w-full text-sm flex items-center justify-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
        </motion.div>
      </div>
    </>
  );
}
