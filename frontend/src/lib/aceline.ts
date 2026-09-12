// Aceline SDK — single entry point for integrating Aceline into any project
// Usage:
//   import { AcelineButton, AcelineOverlay, useAcelineStore, registerPageActions } from "@/lib/aceline";
//   // or copy this folder into your project and adjust imports

export { AcelineButton } from "@/components/aceline/AcelineButton";
export { AcelineOverlay } from "@/components/aceline/AcelineOverlay";
export { AcelineConsentModal } from "@/components/aceline/AcelineConsentModal";
export { AcelineTerminal } from "@/components/aceline/AcelineTerminal";

export { useAcelineStore } from "@/lib/acelineStore";
export { useAcelineConsent, ALL_CONSENT_FEATURES, CONSENT_FEATURE_LABELS, type ConsentFeature } from "@/lib/acelineConsent";
export { useAcelineVoice, type AcelinePersonality } from "@/lib/acelineVoice";
export { acelineChat, executeAction, buildAndStorePageApi } from "@/lib/acelineApi";
export {
  usePageActions,
  useAllRegisteredPages,
  getAllRegisteredPages,
  registerPageActions,
  unregisterPageActions,
  getPageActions,
  getPageApiSummary,
  subscribeToRegistry,
  type AcelineAction,
  type PageApiSummary,
} from "@/lib/acelineRegistry";
export { useJarvis, type JarvisSettings } from "@/lib/useJarvis";

// Convenience: install Aceline globally in a React app
// import { installAceline } from "@/lib/aceline";
// installAceline();  // renders AcelineButton + AcelineOverlay + AcelineConsentModal globally
export function installAceline(): void {
  if (typeof window === "undefined") return;
  if ((window as any).__acelineInstalled) return;
  (window as any).__acelineInstalled = true;
  // The actual rendering is done in App.tsx by importing the components directly.
  // This function is a marker for tooling and to prevent double-install.
  console.log("[Aceline SDK] Installed. Render <AcelineButton />, <AcelineOverlay />, and <AcelineConsentModal /> in your root component.");
}
