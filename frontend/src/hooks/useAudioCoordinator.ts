import { useRef, useEffect, useCallback, useState } from "react";

const CHANNEL_NAME = "soulmate_audio";

export interface AudioCoordinatorMessage {
  type: "play" | "stopped" | "mute" | "unmute" | "query_active";
  sourceId: string;
  sourceType: "radio" | "podcast" | "voice_message" | "video_call" | "walkie";
  label?: string;
}

export interface AudioSource {
  id: string;
  type: AudioCoordinatorMessage["sourceType"];
  label: string;
  isPlaying: boolean;
  isMuted: boolean;
}

let activeSourceId: string | null = null;
const sources = new Map<string, AudioSource>();

export function useAudioCoordinator(sourceType: AudioCoordinatorMessage["sourceType"], label: string = "") {
  const sourceIdRef = useRef(`${sourceType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [isGloballyActive, setIsGloballyActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [activeSource, setActiveSource] = useState<AudioSource | null>(null);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = channel;

      channel.onmessage = (e: MessageEvent<AudioCoordinatorMessage>) => {
        const msg = e.data;
        if (!msg || msg.sourceId === sourceIdRef.current) return;

        if (msg.type === "play") {
          activeSourceId = msg.sourceId;
          sources.set(msg.sourceId, {
            id: msg.sourceId, type: msg.sourceType, label: msg.label || "",
            isPlaying: true, isMuted: false,
          });
          setActiveSource(sources.get(msg.sourceId) || null);
          if (msg.sourceType !== "video_call" && msg.sourceType !== "walkie") {
            setIsGloballyActive(false);
          }
        } else if (msg.type === "stopped") {
          if (activeSourceId === msg.sourceId) {
            activeSourceId = null;
            setActiveSource(null);
          }
          sources.delete(msg.sourceId);
        } else if (msg.type === "mute") {
          const s = sources.get(msg.sourceId);
          if (s) { s.isMuted = true; setActiveSource({ ...s }); }
        } else if (msg.type === "unmute") {
          const s = sources.get(msg.sourceId);
          if (s) { s.isMuted = false; setActiveSource({ ...s }); }
        }
      };
    } catch {
      // BroadcastChannel not supported
    }
    return () => {
      if (channel) channel.close();
      channelRef.current = null;
      sources.delete(sourceIdRef.current);
      if (activeSourceId === sourceIdRef.current) activeSourceId = null;
    };
  }, []);

  const announcePlay = useCallback((lbl?: string) => {
    try {
      channelRef.current?.postMessage({
        type: "play",
        sourceId: sourceIdRef.current,
        sourceType,
        label: lbl || label,
      } as AudioCoordinatorMessage);
      activeSourceId = sourceIdRef.current;
      setIsGloballyActive(true);
      sources.set(sourceIdRef.current, {
        id: sourceIdRef.current, type: sourceType, label: lbl || label,
        isPlaying: true, isMuted: false,
      });
    } catch {}
  }, [sourceType, label]);

  const announceStop = useCallback(() => {
    try {
      channelRef.current?.postMessage({
        type: "stopped",
        sourceId: sourceIdRef.current,
        sourceType,
      } as AudioCoordinatorMessage);
      if (activeSourceId === sourceIdRef.current) {
        activeSourceId = null;
        setActiveSource(null);
      }
      setIsGloballyActive(false);
      sources.delete(sourceIdRef.current);
    } catch {}
  }, [sourceType]);

  const announceMute = useCallback(() => {
    try {
      channelRef.current?.postMessage({
        type: "mute",
        sourceId: sourceIdRef.current,
        sourceType,
      } as AudioCoordinatorMessage);
      setIsMuted(true);
    } catch {}
  }, [sourceType]);

  const announceUnmute = useCallback(() => {
    try {
      channelRef.current?.postMessage({
        type: "unmute",
        sourceId: sourceIdRef.current,
        sourceType,
      } as AudioCoordinatorMessage);
      setIsMuted(false);
    } catch {}
  }, [sourceType]);

  const shouldPause = useCallback(() => {
    return !isGloballyActive && activeSourceId !== null && activeSourceId !== sourceIdRef.current;
  }, [isGloballyActive]);

  return {
    sourceId: sourceIdRef.current,
    announcePlay,
    announceStop,
    announceMute,
    announceUnmute,
    shouldPause,
    isGloballyActive,
    isMuted,
    activeSource,
  };
}
