import type { AppPage } from "@/lib/store";

export interface AcelineAction {
  id: string;
  label: string;
  description: string;
  category: "navigation" | "read" | "write" | "control" | "system";
  execute: () => Promise<any> | any;
  readState?: () => any;
}

export interface PageApiSummary {
  page: AppPage;
  registeredAt: number;
  actions: { id: string; label: string; description: string; category: string }[];
}

const registry = new Map<AppPage, AcelineAction[]>();
const listeners = new Set<() => void>();

export function registerPageActions(page: AppPage, actions: AcelineAction[]): void {
  registry.set(page, actions);
  listeners.forEach((l) => {
    try { l(); } catch {}
  });
}

export function unregisterPageActions(page: AppPage): void {
  registry.delete(page);
  listeners.forEach((l) => {
    try { l(); } catch {}
  });
}

export function getPageActions(page: AppPage): AcelineAction[] {
  return registry.get(page) || [];
}

export function getPageApiSummary(page: AppPage): PageApiSummary {
  const actions = getPageActions(page);
  return {
    page,
    registeredAt: Date.now(),
    actions: actions.map((a) => ({
      id: a.id,
      label: a.label,
      description: a.description,
      category: a.category,
    })),
  };
}

export function getAllRegisteredPages(): AppPage[] {
  return Array.from(registry.keys());
}

export function subscribeToRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Helper hook for React components
import { useSyncExternalStore } from "react";

export function usePageActions(page: AppPage): AcelineAction[] {
  return useSyncExternalStore(
    subscribeToRegistry,
    () => getPageActions(page),
    () => getPageActions(page)
  );
}

export function useAllRegisteredPages(): AppPage[] {
  return useSyncExternalStore(
    subscribeToRegistry,
    () => getAllRegisteredPages(),
    () => getAllRegisteredPages()
  );
}
