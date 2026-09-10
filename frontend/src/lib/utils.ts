import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortenAddress(addr: string, chars = 6): string {
  if (!addr) return "";
  return `${addr.slice(0, chars)}...${addr.slice(-4)}`;
}

export function formatBalance(val: string | number, decimals = 4): string {
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "0.0000";
  return num.toFixed(decimals);
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    resolve();
  });
}

export function timeAgo(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export type DeviceKind = "phone" | "tablet" | "laptop" | "desktop";

export function getDeviceKind(): DeviceKind {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  const touchPoints = navigator.maxTouchPoints || 0;
  const width = typeof window !== "undefined" ? window.innerWidth : 1280;
  if (/Android|iPhone|iPod|Windows Phone/i.test(ua)) return "phone";
  if (/iPad|Tablet/i.test(ua) || (touchPoints > 1 && width < 1100 && /Macintosh/i.test(ua))) return "tablet";
  if (touchPoints > 0 && width <= 1366) return "laptop";
  return "desktop";
}

export function isMobileDevice(): boolean {
  const kind = getDeviceKind();
  return kind === "phone" || kind === "tablet";
}

export async function hasPlatformAuthenticator(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function") {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  } catch {}
  return false;
}
