/**
 * useActivity — React hook for tracking activity events.
 *
 * Usage:
 *   const { track, trackClick, trackCommand } = useActivity("my-page");
 *   trackClick("submit-button");
 *   trackCommand("npm run build", 0, 5000);
 */

import { useEffect, useRef, useCallback } from "react";
import { trackActivity, setPageForTracking } from "./activityWatcher";

export function useActivity(pageName: string) {
  const pageRef = useRef(pageName);

  useEffect(() => {
    pageRef.current = pageName;
    setPageForTracking(pageName);
  }, [pageName]);

  const track = useCallback(
    (eventType: string, action?: string, target?: string, metadata?: Record<string, any>, durationMs?: number) => {
      trackActivity({
        event_type: eventType,
        page: pageRef.current,
        action,
        target,
        metadata,
        duration_ms: durationMs,
      });
    },
    []
  );

  const trackClick = useCallback(
    (target: string, action = "click") => {
      trackActivity({
        event_type: "click",
        page: pageRef.current,
        target,
        action,
      });
    },
    []
  );

  const trackCommand = useCallback(
    (command: string, exitCode: number = 0, durationMs: number = 0) => {
      trackActivity({
        event_type: "command",
        page: pageRef.current,
        action: command,
        target: "terminal",
        metadata: { exit_code: exitCode },
        duration_ms: durationMs,
      });
    },
    []
  );

  const trackBuild = useCallback(
    (command: string, success: boolean, durationMs: number) => {
      trackActivity({
        event_type: "build",
        page: pageRef.current,
        action: command,
        target: "build-system",
        metadata: { success },
        duration_ms: durationMs,
      });
    },
    []
  );

  const trackFileOp = useCallback(
    (operation: string, path: string, fileSize?: number) => {
      trackActivity({
        event_type: "file_op",
        page: pageRef.current,
        action: operation,
        target: path,
        metadata: { file_size: fileSize },
      });
    },
    []
  );

  const trackError = useCallback(
    (errorType: string, message: string) => {
      trackActivity({
        event_type: "error",
        page: pageRef.current,
        action: errorType,
        target: "system",
        metadata: { message: message.slice(0, 200) }, // Truncate — no full stack traces
      });
    },
    []
  );

  return {
    track,
    trackClick,
    trackCommand,
    trackBuild,
    trackFileOp,
    trackError,
  };
}
