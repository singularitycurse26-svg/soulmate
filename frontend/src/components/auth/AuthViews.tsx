import { useState } from "react";
import { useStore } from "@/lib/store";
import { authApi } from "@/lib/api";
import { saveAccountToVault } from "@/lib/vault";
import { Fingerprint, Mail, Lock, ArrowRight, ArrowLeft, Loader2, CheckCircle } from "lucide-react";

export function AuthViews() {
  const { view, setView, setAuth, showAlert, setLoading, loadingText } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);

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
        saveAccountToVault(email.toLowerCase(), data.session_token, {
          last_login: new Date().toISOString(),
        });
        showAlert("success", "Welcome back!");
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
      const challenge = Uint8Array.from(atob(beginResp.challenge), c => c.charCodeAt(0));
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
        saveAccountToVault(result.email, result.session_token, {
          last_login: new Date().toISOString(),
          method: "fingerprint",
        });
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
        setView("create-wallet");
      } else {
        showAlert("danger", result.detail || "Fingerprint registration failed");
        setView("create-wallet");
      }
    } catch (e: any) {
      if (e.name === "NotAllowedError") {
        showAlert("info", "Fingerprint registration was cancelled");
      } else {
        showAlert("danger", e.message || "Fingerprint registration failed");
      }
      setView("create-wallet");
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
                onClick={() => setView("create-wallet")}
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
                onClick={() => setView("create-wallet")}
                className="btn-primary w-full"
              >
                Continue to Wallet
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
        <div className="relative mb-6">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className="w-full pl-10"
            autoComplete="current-password"
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
        </div>

        <button onClick={handleLogin} disabled={busy} className="btn-primary w-full mb-3">
          Log In <ArrowRight className="w-4 h-4 inline ml-1" />
        </button>
        <button
          onClick={() => setView("signup")}
          className="btn-secondary w-full mb-2"
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
