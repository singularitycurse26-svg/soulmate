import { useState, useEffect } from "react";
import { subscriptionApi } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Shield, Crown, Check, Loader2, Copy, Fingerprint } from "lucide-react";

export function SecurityPage() {
  const { showAlert, authEmail } = useStore();
  const [tier, setTier] = useState<string>("free");
  const [tierInfo, setTierInfo] = useState<any>(null);
  const [tiers, setTiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [txHash, setTxHash] = useState("");
  const [upgrading, setUpgrading] = useState(false);

  const load = async () => {
    try {
      const [sub, tiersResp] = await Promise.all([
        subscriptionApi.get(),
        subscriptionApi.tiers(),
      ]);
      setTier(sub.tier);
      setTierInfo(sub);
      setTiers(tiersResp.tiers || []);
    } catch (e: any) {
      showAlert("danger", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleUpgrade = async (targetTier: string) => {
    if (!txHash.trim()) return showAlert("danger", "Enter your transaction hash after sending payment");
    setUpgrading(true);
    try {
      await subscriptionApi.upgrade(txHash, targetTier);
      showAlert("success", `Upgraded to ${targetTier}!`);
      setTxHash("");
      load();
    } catch (e: any) {
      showAlert("danger", e.message);
    } finally {
      setUpgrading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  const isFreeUser = tierInfo?.free;
  const paymentAddress = tiers.find((t: any) => t.name === "pro") ? "0x7Fb10c467319Dd4C9CEB3fcF018C2101a0842D8d" : "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Security & Subscription</h2>
        <p className="text-muted text-sm mt-1">Manage your account and plan</p>
      </div>

      {/* Current tier badge */}
      <div className={cn(
        "card flex items-center gap-4",
        tier === "unlimited" && "border-warning",
        tier === "pro" && "border-accent",
      )}>
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center",
          tier === "unlimited" ? "bg-warning/10" : tier === "pro" ? "bg-accent/10" : "bg-bg-alt"
        )}>
          {tier === "unlimited" ? <Crown className="w-6 h-6 text-warning" /> : <Shield className="w-6 h-6 text-accent" />}
        </div>
        <div className="flex-1">
          <p className="font-bold capitalize">{tier} Plan</p>
          <p className="text-xs text-muted">
            {isFreeUser ? `Founder — Free Unlimited (${tierInfo?.reason})` : "Active subscription"}
          </p>
        </div>
      </div>

      {/* Account info */}
      <div className="card">
        <h3 className="font-semibold mb-3">Account</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Email</span>
            <span>{authEmail}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Fingerprint</span>
            <span>{localStorage.getItem("fingerprint_registered") === "true" ? "Enabled" : "Not set"}</span>
          </div>
        </div>
      </div>

      {/* Pricing tiers */}
      {!isFreeUser && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Plans</h3>
          <div className="grid gap-3">
            {tiers.map((t: any) => (
              <div
                key={t.name}
                className={cn(
                  "card",
                  t.name === tier && "border-accent",
                  t.name === "unlimited" && "border-warning/50"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-bold capitalize">{t.name}</p>
                    <p className="text-2xl font-bold">
                      {t.price === 0 ? "Free" : `$${t.price}/mo`}
                      <span className="text-sm text-muted font-normal"> USDT</span>
                    </p>
                  </div>
                  {t.name === tier && (
                    <span className="text-xs bg-accent/10 text-accent px-2 py-1 rounded">Current</span>
                  )}
                </div>
                <div className="space-y-1 text-xs text-muted">
                  <p>✓ {t.features.emails_per_day === -1 ? "Unlimited" : t.features.emails_per_day} emails/day</p>
                  <p>✓ {t.features.sms_per_day === -1 ? "Unlimited" : t.features.sms_per_day} SMS/day</p>
                  <p>✓ {t.features.ai_requests_per_day === -1 ? "Unlimited" : t.features.ai_requests_per_day} AI requests/day</p>
                  <p>✓ {t.features.storage_mb >= 1000 ? `${t.features.storage_mb / 1000}GB` : `${t.features.storage_mb}MB`} storage</p>
                </div>
                {t.price > 0 && t.name !== tier && (
                  <button
                    onClick={() => handleUpgrade(t.name)}
                    disabled={upgrading}
                    className="btn-primary w-full mt-3 text-sm"
                  >
                    Upgrade to {t.name}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Payment instructions */}
          <div className="card mt-4">
            <h4 className="font-semibold mb-2">How to Upgrade</h4>
            <ol className="text-sm text-muted space-y-1 list-decimal list-inside">
              <li>Send USDT (BSC) to: <code className="text-accent">{paymentAddress.slice(0, 10)}...{paymentAddress.slice(-6)}</code></li>
              <li>Copy your transaction hash</li>
              <li>Paste it below and click Upgrade</li>
            </ol>
            <div className="flex gap-2 mt-3">
              <input
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder="0x... transaction hash"
                className="flex-1 text-sm"
              />
              <button
                onClick={() => { navigator.clipboard.writeText(paymentAddress); showAlert("info", "Payment address copied"); }}
                className="btn-secondary text-sm"
              >
                <Copy className="w-4 h-4" /> Copy Addr
              </button>
            </div>
          </div>
        </div>
      )}

      {isFreeUser && (
        <div className="card text-center py-6">
          <Crown className="w-10 h-10 text-warning mx-auto mb-2" />
          <p className="font-bold text-warning">Founder Status</p>
          <p className="text-muted text-sm mt-1">You have unlimited access to all features, forever. Thank you for building Soulmate OS!</p>
        </div>
      )}
    </div>
  );
}
