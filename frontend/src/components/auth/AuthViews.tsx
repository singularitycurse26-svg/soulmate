import { useState } from "react";
import { ethers } from "ethers";
import { useStore } from "@/lib/store";
import { authApi, API_URL } from "@/lib/api";
import { saveAccountToVault, saveWalletToVault } from "@/lib/vault";
import { Fingerprint, Mail, Lock, ArrowRight, ArrowLeft, Loader2, CheckCircle, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const WALLET_BIO_KEY = "soulmate_wallet_bio";

function getWalletBiometricEntries(): Array<{ credential_id: string; encrypted_key: string; address: string }> {
  try {
    return JSON.parse(localStorage.getItem(WALLET_BIO_KEY) || "[]");
  } catch {
    return [];
  }
}

async function decryptWalletKey(encryptedB64: string, credentialId: ArrayBuffer): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedB64), (c: string) => c.charCodeAt(0));
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

export function AuthViews() {
  const { view, setView, setAuth, setFounder, showAlert, setLoading, loadingText } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const hasFingerprint =
    typeof window !== "undefined" &&
    window.PublicKeyCredential &&
    localStorage.getItem("fingerprint_registered") === "true";

  const handleSignup = async () => {
    if (!email.includes("@")) return showAlert("danger", "Enter a valid email");
    if (password.length < 8) return showAlert("danger", "Password must be 8+ characters");
    if (password !== password2) return showAlert("danger", "Passwords don't match");

    setBusy(true);
    setLoading("Creating account...");
    setView("loading");
    try {
      const data = await authApi.signup(email.toLowerCase(), password);
      if (data.status === "created") {
        setAuth(data.session_token, email.toLowerCase());
        saveAccountToVault(email.toLowerCase(), data.session_token, {
          user_id: String(data.user_id),
          password_hint: password.slice(0, 2) + "***",
        });
        showAlert("success", "Account created! Info saved to vault.");
        setView("fingerprint-register");
      } else if (data.detail?.includes("already")) {
        showAlert("danger", "Email already registered. Try logging in.");
        setView("login");
      } else {
        showAlert("danger", data.detail || "Signup failed");
        setView("signup");
      }
    } catch (e: any) {
      showAlert("danger", e.message);
      setView("signup");
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) return showAlert("danger", "Enter email and password");
    setBusy(true);
    setLoading("Logging in...");
    setView("loading");
    try {
      const data = await authApi.login(email.toLowerCase(), password);
      if (data.status === "ok") {
        setAuth(data.session_token, email.toLowerCase());
        if (data.is_founder) {
          setFounder(true);
          showAlert("success", "Welcome back, Founder! All features unlocked.");
        } else {
          setFounder(false);
          showAlert("success", "Welcome back!");
        }
        saveAccountToVault(email.toLowerCase(), data.session_token, {
          last_login: new Date().toISOString(),
        });
        if (rememberMe) {
          localStorage.setItem("remember_me_email", email.toLowerCase());
          localStorage.setItem("remember_me_password", password);
          localStorage.setItem("remember_me_device", "true");
        } else {
          localStorage.removeItem("remember_me_email");
          localStorage.removeItem("remember_me_password");
          localStorage.removeItem("remember_me_device");
        }
        setView("app");
      } else {
        showAlert("danger", data.detail || "Login failed");
        setView("login");
      }
    } catch (e: any) {
      showAlert("danger", e.message);
      setView("login");
    } finally {
      setBusy(false);
    }
  };

  const handleFingerprint = async () => {
    if (!window.PublicKeyCredential) return showAlert("danger", "Fingerprint not available on this device");

    setBusy(true);
    setLoading("Authenticating with fingerprint...");
    setView("loading");
    try {
      const beginResp = await authApi.webauthnAuthBegin(email.toLowerCase());
      const challenge = Uint8Array.from(atob(beginResp.challenge), (c: string) => c.charCodeAt(0));
      const allowCreds: PublicKeyCredentialDescriptor[] = [];

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: beginResp.rpId,
          timeout: beginResp.timeout || 60000,
          userVerification: beginResp.userVerification || "required",
          allowCredentials: allowCreds,
        },
      }) as PublicKeyCredential;

      if (!assertion) throw new Error("No credential returned");

      const credId = btoa(String.fromCharCode(...new Uint8Array(assertion.rawId)));
      const signCount = (assertion.response as AuthenticatorAssertionResponse).authenticatorData
        ? new Uint8Array((assertion.response as AuthenticatorAssertionResponse).authenticatorData).byteLength
        : 0;

      const result = await authApi.webauthnAuthComplete(credId, signCount);
      if (result.status === "ok") {
        setAuth(result.session_token, result.email);
        localStorage.setItem("auth_email", result.email);
        saveAccountToVault(result.email, result.session_token, {
          last_login: new Date().toISOString(),
          method: "fingerprint",
        });

        // Auto-unlock wallet if biometric entries exist
        const bioEntries = getWalletBiometricEntries();
        if (bioEntries.length > 0) {
          for (const entry of bioEntries) {
            try {
              const decryptedKey = await decryptWalletKey(entry.encrypted_key, assertion.rawId);
              if (decryptedKey) {
                const wallet = new ethers.Wallet(decryptedKey);
                useStore.getState().setWallet(wallet.address, decryptedKey);
                saveWalletToVault(wallet.address, decryptedKey);
                break;
              }
            } catch {
              continue;
            }
          }
        }

        showAlert("success", "Welcome back! (Fingerprint)");
        setView("app");
      } else {
        showAlert("danger", result.detail || "Fingerprint authentication failed");
        setView("login");
      }
    } catch (e: any) {
      if (e.name === "NotAllowedError") {
        showAlert("info", "Fingerprint authentication was cancelled");
      } else {
        showAlert("danger", e.message || "Fingerprint authentication failed");
      }
      setView("login");
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterFingerprint = async () => {
    if (!window.PublicKeyCredential) return showAlert("danger", "Fingerprint not available on this device");

    setBusy(true);
    setLoading("Registering fingerprint...");
    setView("loading");
    try {
      const beginResp = await authApi.webauthnRegisterBegin();
      const challenge = Uint8Array.from(atob(beginResp.challenge), c => c.charCodeAt(0));
      const userId = Uint8Array.from(beginResp.user.id, c => c.charCodeAt(0));

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
      const signCount = 0;

      const result = await authApi.webauthnRegisterComplete(credId, pubKey, signCount);
      if (result.status === "registered") {
        localStorage.setItem("fingerprint_registered", "true");
        showAlert("success", "Fingerprint registered! You can now use it to log in.");
        setView("app");
      } else {
        showAlert("danger", result.detail || "Fingerprint registration failed");
        setView("app");
      }
    } catch (e: any) {
      if (e.name === "NotAllowedError") {
        showAlert("info", "Fingerprint registration was cancelled");
      } else {
        showAlert("danger", e.message || "Fingerprint registration failed");
      }
      setView("app");
    } finally {
      setBusy(false);
    }
  };

  if (view === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Loader2 className="w-10 h-10 text-accent animate-spin" />
        <p className="text-muted">{loadingText}</p>
      </div>
    );
  }

  if (view === "signup") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-sm card animate-scale-in">
          <h2 className="text-2xl font-bold mb-1">Create Account</h2>
          <p className="text-muted text-sm mb-6">
            Sign up with email and password. Unlock with fingerprint after.
          </p>

          <label className="label">Email</label>
          <div className="relative mb-4">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full pl-10"
              autoComplete="email"
            />
          </div>

          <label className="label">Password (min 8 characters)</label>
          <div className="relative mb-4">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
              className="w-full pl-10"
              autoComplete="new-password"
            />
          </div>

          <label className="label">Confirm Password</label>
          <div className="relative mb-6">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              placeholder="Repeat password"
              className="w-full pl-10"
              autoComplete="new-password"
            />
          </div>

          <button onClick={handleSignup} disabled={busy} className="btn-primary w-full mb-3">
            Sign Up
          </button>
          <button
            onClick={() => setView("login")}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (view === "fingerprint-register") {
    const supportsWebAuthn = typeof window !== "undefined" && window.PublicKeyCredential;
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-sm card animate-scale-in text-center">
          <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-success" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Account Created!</h2>
          <p className="text-muted text-sm mb-6">
            Would you like to enable fingerprint login? You can use Windows Hello, Touch ID, or your device's fingerprint sensor to unlock Soulmate OS without typing your password.
          </p>

          {supportsWebAuthn ? (
            <>
              <button
                onClick={handleRegisterFingerprint}
                disabled={busy}
                className="btn-primary w-full mb-3 flex items-center justify-center gap-2"
              >
                <Fingerprint className="w-5 h-5" />
                Enable Fingerprint Login
              </button>
              <button
                onClick={() => setView("app")}
                className="btn-ghost w-full text-sm"
              >
                Skip for now
              </button>
            </>
          ) : (
            <>
              <p className="text-muted text-xs mb-4">
                Fingerprint login isn't available on this device. You can still use email and password.
              </p>
              <button
                onClick={() => setView("app")}
                className="btn-primary w-full"
              >
                Continue
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Login view (default)
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-sm card animate-scale-in">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gradient mb-1">Soulmate OS</h1>
          <p className="text-muted text-sm">Personal AI Communication</p>
        </div>

        {hasFingerprint && (
          <>
            <div className="text-center mb-4">
              <button
                onClick={handleFingerprint}
                className="w-20 h-20 rounded-full bg-bg-alt border border-border flex items-center justify-center mx-auto hover:border-accent transition-all animate-glow"
              >
                <Fingerprint className="w-10 h-10 text-accent" />
              </button>
              <p className="text-muted text-xs mt-2">Tap to unlock with fingerprint</p>
            </div>
            <div className="border-t border-border my-4" />
          </>
        )}

        <label className="label">Email</label>
        <div className="relative mb-4">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full pl-10"
            autoComplete="email"
          />
        </div>

        <label className="label">Password</label>
        <div className="relative mb-3">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className="w-full pl-10 pr-10"
            autoComplete="current-password"
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>

        {/* Remember Me checkbox */}
        <div className="flex items-center gap-2 mb-4 cursor-pointer" onClick={() => setRememberMe(!rememberMe)}>
          <div className={cn(
            "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
            rememberMe ? "bg-accent border-accent" : "border-border bg-bg-alt"
          )}>
            {rememberMe && <CheckCircle className="w-3.5 h-3.5 text-white" />}
          </div>
          <span className="text-sm text-muted select-none">Remember me on this device</span>
        </div>

        <button onClick={handleLogin} disabled={busy} className="btn-primary w-full mb-3">
          Log In <ArrowRight className="w-4 h-4 inline ml-1" />
        </button>

        {/* Social Login */}
        <div className="relative my-4">
          <div className="border-t border-border" />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bg-card px-3 text-xs text-muted">
            or sign in with
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => { window.location.href = `${API_URL}/v1/auth/oauth/google/start`; }}
            className="flex flex-col items-center gap-1 py-3 rounded-lg border border-border bg-bg-alt hover:border-red-400/50 transition-all"
            title="Sign in with Google"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            <span className="text-[10px] text-muted">Google</span>
          </button>
          <button
            onClick={() => { window.location.href = `${API_URL}/v1/auth/oauth/github/start`; }}
            className="flex flex-col items-center gap-1 py-3 rounded-lg border border-border bg-bg-alt hover:border-gray-400/50 transition-all"
            title="Sign in with GitHub"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.81 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.37 1.23-3.21-.12-.3-.54-1.515.12-3.15 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.635.24 2.85.12 3.15.765.84 1.23 1.905 1.23 3.21 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            <span className="text-[10px] text-muted">GitHub</span>
          </button>
          <button
            onClick={() => { window.location.href = `${API_URL}/v1/auth/oauth/yahoo/start`; }}
            className="flex flex-col items-center gap-1 py-3 rounded-lg border border-border bg-bg-alt hover:border-purple-400/50 transition-all"
            title="Sign in with Yahoo"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#6001D2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.5 14.5l-2-4.5-2 4.5h-2l3-7-3-7h2l2 4.5 2-4.5h2l-3 7 3 7h-2z"/><circle cx="18" cy="6" r="2"/></svg>
            <span className="text-[10px] text-muted">Yahoo</span>
          </button>
          <button
            onClick={() => { window.location.href = `${API_URL}/v1/auth/oauth/telegram/start`; }}
            className="flex flex-col items-center gap-1 py-3 rounded-lg border border-border bg-bg-alt hover:border-blue-400/50 transition-all"
            title="Sign in with Telegram"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#0088cc"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.643.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/></svg>
            <span className="text-[10px] text-muted">Telegram</span>
          </button>
        </div>

        <button
          onClick={() => setView("signup")}
          className="btn-secondary w-full mb-2 mt-4"
        >
          Create Account
        </button>
        <button
          onClick={() => {
            setView("create-wallet");
          }}
          className="text-muted text-xs hover:text-white transition-colors w-full text-center"
        >
          Skip — Use Wallet Without Account
        </button>
      </div>
    </div>
  );
}
