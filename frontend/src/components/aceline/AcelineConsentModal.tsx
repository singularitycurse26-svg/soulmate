import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  useAcelineConsent,
  ALL_CONSENT_FEATURES,
  CONSENT_FEATURE_LABELS,
  type ConsentFeature,
} from "@/lib/acelineConsent";
import {
  Mic, Wallet, Cpu, Terminal, FileText, Zap, Globe, Sparkles,
  ShieldCheck, ShieldX, Check, X, Lock, MessageSquare,
} from "lucide-react";

const ICONS: Record<string, any> = {
  Mic, Wallet, Cpu, Terminal, FileText, Zap, Globe, Sparkles,
};

export function AcelineConsentModal() {
  const consent = useAcelineConsent();
  const [remember, setRemember] = useState(consent.remembered);
  const [directives, setDirectives] = useState(consent.customDirectives);

  const shouldShow = !consent.given && !consent.shown;

  const handleAllow = () => {
    consent.grantAll();
    consent.setCustomDirectives(directives);
    consent.setRemembered(remember);
    consent.confirm();
  };

  const handleDeny = () => {
    consent.denyAll();
    consent.setCustomDirectives(directives);
    consent.setRemembered(remember);
    consent.confirm();
  };

  const handleDismiss = () => {
    consent.setCustomDirectives(directives);
    consent.setRemembered(remember);
    consent.dismiss();
  };

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={handleDismiss}
        >
          <motion.div
            initial={{ scale: 0.92, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-bg-card border border-accent/30 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto no-scrollbar"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 bg-accent/5">
              <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-bold">Aceline Runtime Consent</h2>
                <p className="text-[10px] text-muted">Choose what Aceline can do on this device</p>
              </div>
              <button
                onClick={handleDismiss}
                className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Master switch */}
            <div className="px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (consent.masterAllow) {
                      consent.denyAll();
                    } else {
                      consent.grantAll();
                    }
                  }}
                  className={cn(
                    "relative w-12 h-6 rounded-full transition flex-shrink-0",
                    consent.masterAllow ? "bg-accent" : "bg-bg-alt border border-white/10"
                  )}
                >
                  <div
                    className={cn(
                      "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                      consent.masterAllow ? "translate-x-6" : "translate-x-0.5"
                    )}
                  />
                </button>
                <div className="flex-1">
                  <p className="text-xs font-semibold">
                    {consent.masterAllow ? "Full Capabilities" : "Safe Mode (Read-Only)"}
                  </p>
                  <p className="text-[10px] text-muted">
                    {consent.masterAllow
                      ? "All features enabled. Aceline can do anything."
                      : "No actions, no terminal, no voice. Aceline can only chat."}
                  </p>
                </div>
                {consent.masterAllow ? (
                  <ShieldCheck className="w-4 h-4 text-success" />
                ) : (
                  <ShieldX className="w-4 h-4 text-muted" />
                )}
              </div>
            </div>

            {/* Per-feature toggles */}
            <div className="px-5 py-3 space-y-1.5">
              <p className="text-[10px] text-muted font-semibold mb-2">FEATURE PERMISSIONS</p>
              {ALL_CONSENT_FEATURES.map((feature: ConsentFeature) => {
                const meta = CONSENT_FEATURE_LABELS[feature];
                const Icon = ICONS[meta.icon] || Sparkles;
                const enabled = consent.features[feature];
                return (
                  <div
                    key={feature}
                    className="flex items-center gap-3 p-2 rounded-lg bg-bg-alt/50 hover:bg-bg-alt transition"
                  >
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
                      enabled ? "bg-accent/15 text-accent" : "bg-white/5 text-muted"
                    )}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium">{meta.label}</p>
                      <p className="text-[9px] text-muted truncate">{meta.description}</p>
                    </div>
                    <button
                      onClick={() => consent.setFeature(feature, !enabled)}
                      className={cn(
                        "relative w-9 h-5 rounded-full transition flex-shrink-0",
                        enabled ? "bg-accent" : "bg-bg-card border border-white/10"
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                          enabled ? "translate-x-4.5" : "translate-x-0.5"
                        )}
                      />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Custom directives */}
            <div className="px-5 py-3 border-t border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-3.5 h-3.5 text-accent" />
                <p className="text-[10px] text-muted font-semibold">TELL ACELINE TO DO SOMETHING</p>
              </div>
              <textarea
                value={directives}
                onChange={(e) => setDirectives(e.target.value)}
                placeholder="e.g. 'always ask before running commands', 'focus on day trading', 'be terse', 'prioritize the music studio'..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-bg-alt border border-white/10 text-[11px] resize-none focus:outline-none focus:border-accent/50"
              />
              <p className="text-[9px] text-muted mt-1">
                These instructions are injected into Aceline's system prompt on every interaction.
              </p>
            </div>

            {/* Remember checkbox */}
            <div className="px-5 py-2 flex items-center gap-2">
              <button
                onClick={() => setRemember(!remember)}
                className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center transition flex-shrink-0",
                  remember ? "bg-accent border-accent" : "bg-bg-alt border-white/20"
                )}
              >
                {remember && <Check className="w-3 h-3 text-white" />}
              </button>
              <span className="text-[10px] text-muted">Remember my choice (won't ask again)</span>
            </div>

            {/* Actions */}
            <div className="px-5 py-4 border-t border-white/10 flex gap-2">
              <button
                onClick={handleDeny}
                className="flex-1 px-4 py-2.5 rounded-xl bg-bg-alt text-muted hover:text-text hover:bg-white/5 transition text-xs font-medium flex items-center justify-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" /> Safe Mode
              </button>
              <button
                onClick={handleAllow}
                className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-white hover:bg-accent/90 transition text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" /> Allow All
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
