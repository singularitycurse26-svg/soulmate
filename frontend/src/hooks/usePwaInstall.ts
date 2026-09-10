import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    let deferred: BeforeInstallPromptEvent | null = null;

    const handler = (e: Event) => {
      e.preventDefault();
      deferred = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    const installedHandler = () => {
      setInstalled(true);
      setCanInstall(false);
    };

    // Check if already in standalone mode (installed)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const promptInstall = async () => {
    if (!canInstall) {
      // Show manual instructions
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) {
        alert("To install Soulmate OS:\n\nTap the Share button, then 'Add to Home Screen'");
      } else {
        alert("To install Soulmate OS:\n\nTap the menu (3 dots) > 'Add to Home screen' or 'Install app'");
      }
      return false;
    }
    const e = new Event("beforeinstallprompt") as BeforeInstallPromptEvent;
    // Use the deferred prompt from the window
    const evt = window as any;
    if (evt._deferredPrompt) {
      evt._deferredPrompt.prompt();
      const choice = await evt._deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
        setCanInstall(false);
        return true;
      }
    }
    return false;
  };

  return { canInstall, installed, promptInstall };
}
