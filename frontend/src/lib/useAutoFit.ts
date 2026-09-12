import { useEffect, useState, useRef, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────

export type ViewportTier = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
export type DeviceKind = "mobile" | "tablet" | "desktop" | "wide";

export interface ViewportInfo {
  width: number;
  height: number;
  tier: ViewportTier;
  device: DeviceKind;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
  sidebarCollapsed: boolean;
  contentMaxWidth: number;
  scale: number;
  orientation: "portrait" | "landscape";
  dpr: number;
}

// ── Breakpoints ──────────────────────────────────────────────────────

const BREAKPOINTS: Record<ViewportTier, number> = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

export const SIDEBAR_WIDTH = 256;
export const MOBILE_NAV_HEIGHT = 56;
export const HEADER_HEIGHT = 56;

// ── Hook: useViewport ────────────────────────────────────────────────

export function useViewport(): ViewportInfo {
  const [info, setInfo] = useState<ViewportInfo>(() => calcViewport());

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setInfo(calcViewport());
      });
    };
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  return info;
}

function calcViewport(): ViewportInfo {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  const orientation: "portrait" | "landscape" = height > width ? "portrait" : "landscape";

  let tier: ViewportTier = "xs";
  if (width >= BREAKPOINTS["2xl"]) tier = "2xl";
  else if (width >= BREAKPOINTS.xl) tier = "xl";
  else if (width >= BREAKPOINTS.lg) tier = "lg";
  else if (width >= BREAKPOINTS.md) tier = "md";
  else if (width >= BREAKPOINTS.sm) tier = "sm";

  let device: DeviceKind = "mobile";
  if (width >= BREAKPOINTS.xl) device = "wide";
  else if (width >= BREAKPOINTS.lg) device = "desktop";
  else if (width >= BREAKPOINTS.sm) device = "tablet";

  const isMobile = width < BREAKPOINTS.md;
  const isTablet = width >= BREAKPOINTS.sm && width < BREAKPOINTS.lg;
  const isDesktop = width >= BREAKPOINTS.lg && width < BREAKPOINTS.xl;
  const isWide = width >= BREAKPOINTS.xl;

  const sidebarCollapsed = isMobile || isTablet;
  const contentMaxWidth = sidebarCollapsed ? width : Math.min(width - SIDEBAR_WIDTH, 1280);

  // Scale factor: how much to scale content to fit
  // On very small screens, scale down slightly to fit more content
  let scale = 1.0;
  if (width < 375) scale = 0.92;
  else if (width < 414) scale = 0.95;
  else if (width < 480) scale = 0.98;

  return {
    width, height, tier, device, isMobile, isTablet, isDesktop, isWide,
    sidebarCollapsed, contentMaxWidth, scale, orientation, dpr,
  };
}

// ── Hook: useAutoFocus ───────────────────────────────────────────────

export function useAutoFocus(page: string) {
  const mainRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to top on page change
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    } else if (mainRef.current) {
      mainRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Auto-focus the main content area for keyboard navigation
    if (mainRef.current) {
      mainRef.current.setAttribute("tabindex", "-1");
      mainRef.current.focus({ preventScroll: true });
    }

    // Also scroll window to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);

  return { mainRef, scrollRef };
}

// ── Hook: useAutoFit ────────────────────────────────────────────────

export function useAutoFit() {
  const viewport = useViewport();
  const [adjusted, setAdjusted] = useState(false);

  useEffect(() => {
    // Set CSS custom properties on root for responsive scaling
    const root = document.documentElement;
    root.style.setProperty("--vp-width", `${viewport.width}px`);
    root.style.setProperty("--vp-height", `${viewport.height}px`);
    root.style.setProperty("--vp-content-max", `${viewport.contentMaxWidth}px`);
    root.style.setProperty("--vp-scale", String(viewport.scale));
    root.style.setProperty("--vp-tier", viewport.tier);
    root.style.setProperty("--vp-device", viewport.device);

    // Adjust font size based on viewport
    let baseFont = 16;
    if (viewport.isMobile) {
      if (viewport.width < 375) baseFont = 14;
      else if (viewport.width < 414) baseFont = 15;
    } else if (viewport.isTablet) {
      baseFont = 16;
    } else if (viewport.isWide) {
      baseFont = 17;
    }
    root.style.setProperty("--vp-base-font", `${baseFont}px`);

    // Adjust content padding based on viewport
    let padX = 16;
    let padY = 16;
    if (viewport.isMobile) {
      padX = 12;
      padY = 12;
    } else if (viewport.isDesktop) {
      padX = 24;
      padY = 20;
    } else if (viewport.isWide) {
      padX = 28;
      padY = 24;
    }
    root.style.setProperty("--vp-pad-x", `${padX}px`);
    root.style.setProperty("--vp-pad-y", `${padY}px`);

    // Adjust gap between elements
    let gap = 16;
    if (viewport.isMobile) gap = 12;
    else if (viewport.isWide) gap = 20;
    root.style.setProperty("--vp-gap", `${gap}px`);

    // Set data attribute on body for CSS targeting
    document.body.dataset.viewport = viewport.device;
    document.body.dataset.tier = viewport.tier;
    document.body.dataset.orientation = viewport.orientation;

    setAdjusted(true);
  }, [viewport]);

  return { viewport, adjusted };
}

// ── Component: AutoFitContainer ─────────────────────────────────────
// (Moved to useAutoFit.tsx for JSX support)


// ── Hook: useResponsiveGrid ─────────────────────────────────────────

export function useResponsiveGrid(minWidth: number = 280): { cols: number } {
  const viewport = useViewport();
  const available = viewport.sidebarCollapsed
    ? viewport.width - 24
    : viewport.width - SIDEBAR_WIDTH - 48;
  const cols = Math.max(1, Math.floor(available / minWidth));
  return { cols };
}

// ── Hook: useResponsiveValue ─────────────────────────────────────────

export function useResponsiveValue<T>(values: { xs: T; sm?: T; md?: T; lg?: T; xl?: T; "2xl"?: T }): T {
  const viewport = useViewport();
  const tiers: ViewportTier[] = ["2xl", "xl", "lg", "md", "sm", "xs"];
  for (const tier of tiers) {
    if (viewport.tier >= tier && values[tier] !== undefined) {
      return values[tier] as T;
    }
  }
  return values.xs;
}
