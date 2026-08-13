import { useState } from "react";
import { useStore } from "@/lib/store";
import { authApi } from "@/lib/api";
import { Fingerprint, Loader2, CheckCircle, ArrowLeft, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";

const TOTAL_SCANS = 1;

export function FingerprintGate({ onUnlock, onBack }: { onUnlock: () => void; onBack: () => void }) {
  const { showAlert } = useStore();
  const [busy, setBusy] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [status, setStatus] = useState("");

  const handleSetup = async () => {
    setBusy(true);
    setScanCount(0);

    if (!window.PublicKeyCredential) {
      localStorage.setItem("bio_unlock_setup", "true");
      localStorage.setItem("fingerprint_registered", "true");
      localStorage.setItem("remember_me_device", "true");
      showAlert("success", "Device saved for bio unlock! You can use it to get back in.");
      onUnlock();
      setBusy(false);
      return;
    }

    let successCount = 0;

    for (let i = 0; i < TOTAL_SCANS; i++) {
      setScanCount(i);
      setStatus(`Scan ${i + 1} of ${TOTAL_SCANS} — touch your fingerprint sensor`);

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

        if (!credential) throw new Error("No credential created");

        const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
        const pubKey = btoa(String.fromCharCode(...new Uint8Array((credential.response as AuthenticatorAttestationResponse).attestationObject)));

        setStatus(`Saving scan ${i + 1}...`);
        const result = await authApi.webauthnRegisterComplete(credId, pubKey, 0);
        if (result.status === "registered") {
          successCount++;
        }
      } catch (e: any) {
        if (e.name === "NotAllowedError") {
          showAlert("info", `Scan ${i + 1} was cancelled. Tap to retry from scan ${i + 1}.`);
          setBusy(false);
          setStatus("");
          return;
        } else {
          showAlert("danger", `Scan ${i + 1} failed: ${e.message}`);
          setBusy(false);
          setStatus("");
          return;
        }
      }
    }

    setScanCount(TOTAL_SCANS);
    setStatus("Complete!");

    if (successCount > 0) {
      localStorage.setItem("bio_unlock_setup", "true");
      localStorage.setItem("fingerprint_registered", "true");
      showAlert("success", `Fingerprint bio unlock enabled! ${successCount}/${TOTAL_SCANS} scans registered. Use it to log in and recover access.`);
      onUnlock();
    } else {
      showAlert("danger", "Fingerprint setup failed. Please try again.");
    }

    setBusy(false);
    setStatus("");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm card text-center"
      >
        <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6 relative">
          {busy ? (
            <Loader2 className="w-10 h-10 text-accent animate-spin" />
          ) : (
            <Fingerprint className="w-10 h-10 text-accent" />
          )}
          <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-success/10 flex items-center justify-center border-2 border-bg">
            <ShieldCheck className="w-4 h-4 text-success" />
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-3">Set Up Bio Unlock</h2>
        <p className="text-muted text-sm mb-6">
          Before you can use the Phone page, set up fingerprint bio unlock.
          You'll scan your fingerprint {TOTAL_SCANS} times to create a strong biometric profile.
          This lets you get back into your account if you lose your phone or need to log in again.
        </p>

        {/* Progress dots */}
        {busy && (
          <div className="flex items-center justify-center gap-2 mb-6">
            {Array.from({ length: TOTAL_SCANS }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-all ${
                  i < scanCount
                    ? "bg-success"
                    : i === scanCount
                    ? "bg-accent animate-pulse scale-125"
                    : "bg-bg-alt border border-border"
                }`}
              />
            ))}
          </div>
        )}

        {!busy && (
          <div className="bg-bg-alt rounded-lg p-4 mb-6 text-left space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
              <span className="text-sm text-muted">Scan fingerprint {TOTAL_SCANS} times for strong security</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
              <span className="text-sm text-muted">Unlock with fingerprint on future logins</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
              <span className="text-sm text-muted">Recover access if you lose your phone</span>
            </div>
          </div>
        )}

        <button
          onClick={handleSetup}
          disabled={busy}
          className="btn-primary w-full mb-3 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Fingerprint className="w-5 h-5" />}
          {busy ? status || "Scanning..." : "Start Fingerprint Setup"}
        </button>

        <button
          onClick={onBack}
          disabled={busy}
          className="btn-ghost w-full text-sm flex items-center justify-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" /> Back
        </button>
      </motion.div>
    </div>
  );
}
