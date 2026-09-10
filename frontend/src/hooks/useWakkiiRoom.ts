import { useState, useEffect, useRef, useCallback } from "react";
import Peer, { MediaConnection } from "peerjs";
import { contactsApi } from "@/lib/api";

export type WakkiiMode = "ptt" | "open";
export type WakkiiRole = "speaker" | "listener";

export interface WakkiiParticipant {
  peerId: string;
  name: string;
  role: WakkiiRole;
  isHost: boolean;
  speaking: boolean;
  handRaised: boolean;
  muted: boolean;
  online: boolean;
  lastSeen: number;
  videoEnabled: boolean;
}

export interface WakkiiRoomState {
  roomId: string;
  mode: WakkiiMode;
  role: WakkiiRole;
  isHost: boolean;
  participants: WakkiiParticipant[];
  connected: boolean;
  error: string | null;
  micEnabled: boolean;
  videoEnabled: boolean;
}

const PEER_PREFIX = "wakkii-";
const APP_BASE_URL = "https://soulmate-os-app.netlify.app";
const MAX_PARTICIPANTS = 8;

function generateRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function getRoomFromHash(): string | null {
  const hash = window.location.hash;
  if (hash.startsWith("#wakkii-")) return hash.slice(8);
  if (hash.startsWith("#") && hash.length === 7) return hash.slice(1);
  return null;
}

function setRoomHash(roomId: string) {
  window.location.hash = `wakkii-${roomId}`;
}

function clearRoomHash() {
  if (window.location.hash.startsWith("#wakkii-")) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

async function autoAddContact(name: string, peerId: string, addedSet: Set<string>) {
  if (!name || name === "Guest" || name === "You") return;
  const key = `${name}:${peerId}`;
  if (addedSet.has(key)) return;
  addedSet.add(key);
  try {
    const existing = await contactsApi.list();
    const contacts = existing.contacts || [];
    const alreadyExists = contacts.some(
      (c: any) => c.name === name && (c.notes || "").includes(`wakkii:${peerId}`)
    );
    if (alreadyExists) return;
    await contactsApi.create({
      name,
      notes: `Auto-added from Wakkii room. Peer: ${peerId}`,
    });
  } catch {}
}

const PRESENCE_KEY = "wakkii_presence";
const PRESENCE_TTL = 15000;

interface PresenceEntry {
  roomId: string;
  ts: number;
}

function updatePresence(name: string, roomId: string) {
  if (!name) return;
  try {
    const raw = localStorage.getItem(PRESENCE_KEY);
    const presence = raw ? JSON.parse(raw) : {};
    presence[name] = { roomId, ts: Date.now() } as PresenceEntry;
    localStorage.setItem(PRESENCE_KEY, JSON.stringify(presence));
  } catch {}
}

function clearPresence(name: string) {
  try {
    const raw = localStorage.getItem(PRESENCE_KEY);
    if (!raw) return;
    const presence = JSON.parse(raw);
    delete presence[name];
    localStorage.setItem(PRESENCE_KEY, JSON.stringify(presence));
  } catch {}
}

export type ContactStatus = "offline" | "same-room" | "other-room";

export function getContactStatuses(currentRoomId?: string): Map<string, ContactStatus> {
  const result = new Map<string, ContactStatus>();
  try {
    const raw = localStorage.getItem(PRESENCE_KEY);
    if (!raw) return result;
    const presence = JSON.parse(raw);
    const now = Date.now();
    for (const [name, entry] of Object.entries(presence)) {
      const e = entry as PresenceEntry;
      if (now - e.ts < PRESENCE_TTL) {
        if (currentRoomId && e.roomId === currentRoomId) {
          result.set(name, "same-room");
        } else {
          result.set(name, "other-room");
        }
      }
    }
  } catch {}
  return result;
}

export function getOnlineContacts(): Set<string> {
  const statuses = getContactStatuses();
  return new Set([...statuses.keys()]);
}

export function useWakkiiRoom(userName: string) {
  const [state, setState] = useState<WakkiiRoomState>({
    roomId: "",
    mode: "ptt",
    role: "speaker",
    isHost: false,
    participants: [],
    connected: false,
    error: null,
    micEnabled: false,
    videoEnabled: false,
  });

  const peerRef = useRef<Peer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoCallsRef = useRef<Map<string, MediaConnection>>(new Map());
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const connectionsRef = useRef<Map<string, any>>(new Map());
  const participantsRef = useRef<Map<string, WakkiiParticipant>>(new Map());
  const modeRef = useRef<WakkiiMode>("ptt");
  const roleRef = useRef<WakkiiRole>("speaker");
  const isHostRef = useRef(false);
  const roomIdRef = useRef("");
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const addedContactsRef = useRef<Set<string>>(new Set());
  const linkedRoomsRef = useRef<Map<string, Peer>>(new Map());

  const updateParticipants = useCallback(() => {
    const list = Array.from(participantsRef.current.values());
    setState((s) => ({ ...s, participants: list }));
  }, []);

  const syncParticipantInfo = useCallback((conn: any, info: Partial<WakkiiParticipant>) => {
    try {
      const peerId = conn.peer;
      const existing = participantsRef.current.get(peerId);
      if (existing) {
        const updated = { ...existing, ...info };
        participantsRef.current.set(peerId, updated);
        updateParticipants();
        conn.send({ type: "participant-update", participant: updated });
      }
    } catch {}
  }, [updateParticipants]);

  const broadcastRoster = useCallback(() => {
    const roster = Array.from(participantsRef.current.values());
    connectionsRef.current.forEach((conn) => {
      try {
        if (conn.open) conn.send({ type: "roster", participants: roster });
      } catch {}
    });
  }, []);

  const setupConnection = useCallback(
    (conn: any, remotePeerId: string) => {
      conn.on("stream", (remoteStream: MediaStream) => {
        let audio = audioElementsRef.current.get(remotePeerId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audioElementsRef.current.set(remotePeerId, audio);
        }
        audio.srcObject = remoteStream;
        audio.play().catch(() => {});

        const existing = participantsRef.current.get(remotePeerId);
        if (!existing) {
          participantsRef.current.set(remotePeerId, {
            peerId: remotePeerId,
            name: "Guest",
            role: "listener" as WakkiiRole,
            isHost: false,
            speaking: false,
            handRaised: false,
            muted: true,
            online: true,
            lastSeen: Date.now(),
            videoEnabled: false,
          });
          updateParticipants();
        }
      });

      conn.on("close", () => {
        participantsRef.current.delete(remotePeerId);
        connectionsRef.current.delete(remotePeerId);
        const audio = audioElementsRef.current.get(remotePeerId);
        if (audio) {
          audio.srcObject = null;
          audioElementsRef.current.delete(remotePeerId);
        }
        updateParticipants();
        broadcastRoster();
      });

      conn.on("error", () => {
        participantsRef.current.delete(remotePeerId);
        connectionsRef.current.delete(remotePeerId);
        updateParticipants();
      });

      connectionsRef.current.set(remotePeerId, conn);
    },
    [updateParticipants, broadcastRoster]
  );

  const setupVideoConnection = useCallback(
    (call: any, remotePeerId: string) => {
      call.on("stream", (remoteStream: MediaStream) => {
        let video = videoElementsRef.current.get(remotePeerId);
        if (!video) {
          video = document.createElement("video");
          video.autoplay = true;
          video.playsInline = true;
          video.muted = false;
          videoElementsRef.current.set(remotePeerId, video);
        }
        video.srcObject = remoteStream;
        video.play().catch(() => {});
        updateParticipants();
      });

      call.on("close", () => {
        const video = videoElementsRef.current.get(remotePeerId);
        if (video) {
          video.srcObject = null;
          videoElementsRef.current.delete(remotePeerId);
        }
        videoCallsRef.current.delete(remotePeerId);
        updateParticipants();
      });

      call.on("error", () => {
        videoCallsRef.current.delete(remotePeerId);
        updateParticipants();
      });

      videoCallsRef.current.set(remotePeerId, call);
    },
    [updateParticipants]
  );

  const broadcastVideoToAll = useCallback(() => {
    const peer = peerRef.current;
    if (!peer || !videoStreamRef.current) return;
    participantsRef.current.forEach((p, peerId) => {
      if (peerId === peer.id) return;
      if (videoCallsRef.current.has(peerId)) return;
      try {
        const call = peer.call(peerId, videoStreamRef.current!, {
          metadata: { type: "video", name: userName },
        });
        if (call) setupVideoConnection(call, peerId);
      } catch {}
    });
  }, [userName, setupVideoConnection]);

  const handleDataMessage = useCallback(
    (data: any, fromPeerId: string) => {
      if (!data || typeof data !== "object") return;

      switch (data.type) {
        case "hello": {
          participantsRef.current.set(fromPeerId, {
            peerId: fromPeerId,
            name: data.name || "Guest",
            role: data.role || "listener",
            isHost: data.isHost || false,
            speaking: false,
            handRaised: false,
            muted: data.role !== "speaker",
            online: true,
            lastSeen: Date.now(),
            videoEnabled: false,
          });
          updateParticipants();
          broadcastRoster();
          autoAddContact(data.name || "Guest", fromPeerId, addedContactsRef.current);
          break;
        }
        case "roster": {
          if (Array.isArray(data.participants)) {
            data.participants.forEach((p: WakkiiParticipant) => {
              participantsRef.current.set(p.peerId, p);
            });
            updateParticipants();
          }
          break;
        }
        case "participant-update": {
          if (data.participant) {
            participantsRef.current.set(data.participant.peerId, data.participant);
            updateParticipants();
          }
          break;
        }
        case "raise-hand": {
          const p = participantsRef.current.get(fromPeerId);
          if (p) {
            p.handRaised = data.raised;
            participantsRef.current.set(fromPeerId, p);
            updateParticipants();
          }
          break;
        }
        case "role-change": {
          const p = participantsRef.current.get(fromPeerId);
          if (p) {
            p.role = data.role;
            p.muted = data.role !== "speaker";
            participantsRef.current.set(fromPeerId, p);
            updateParticipants();
          }
          break;
        }
        case "ptt-start":
        case "ptt-stop": {
          const p = participantsRef.current.get(fromPeerId);
          if (p) {
            p.speaking = data.type === "ptt-start";
            participantsRef.current.set(fromPeerId, p);
            updateParticipants();
          }
          break;
        }
        case "heartbeat": {
          const p = participantsRef.current.get(fromPeerId);
          if (p) {
            p.online = true;
            p.lastSeen = Date.now();
            participantsRef.current.set(fromPeerId, p);
            updateParticipants();
          }
          break;
        }
        case "video-on":
        case "video-off": {
          const p = participantsRef.current.get(fromPeerId);
          if (p) {
            p.videoEnabled = data.type === "video-on";
            participantsRef.current.set(fromPeerId, p);
            updateParticipants();
          }
          break;
        }
        case "room-full": {
          setState((s) => ({ ...s, error: "Room is full (8 people max). Try creating a new room." }));
          break;
        }
      }
    },
    [updateParticipants, broadcastRoster]
  );

  const connectToPeer = useCallback(
    async (remotePeerId: string) => {
      if (!peerRef.current || !streamRef.current) return;
      if (connectionsRef.current.has(remotePeerId)) return;

      const conn = peerRef.current.connect(remotePeerId, {
        metadata: {
          name: userName,
          role: roleRef.current,
          isHost: isHostRef.current,
        },
      });

      conn.on("open", () => {
        try {
          conn.send({
            type: "hello",
            name: userName,
            role: roleRef.current,
            isHost: isHostRef.current,
          });
        } catch {}

        const call = peerRef.current!.call(remotePeerId, streamRef.current!, {
          metadata: { name: userName, role: roleRef.current },
        });
        if (call) setupConnection(call, remotePeerId);
      });

      conn.on("data", (data) => handleDataMessage(data, remotePeerId));

      conn.on("close", () => {
        participantsRef.current.delete(remotePeerId);
        connectionsRef.current.delete(remotePeerId);
        updateParticipants();
      });

      conn.on("error", () => {
        participantsRef.current.delete(remotePeerId);
        connectionsRef.current.delete(remotePeerId);
        updateParticipants();
      });
    },
    [userName, setupConnection, handleDataMessage, updateParticipants]
  );

  const initPeer = useCallback(
    (roomId: string, asHost: boolean) => {
      const peerId = `${PEER_PREFIX}${roomId}`;
      const peer = new Peer(peerId, {
        debug: 1,
      });

      peerRef.current = peer;
      roomIdRef.current = roomId;
      isHostRef.current = asHost;

      peer.on("open", () => {
        setState((s) => ({ ...s, connected: true, error: null }));

        participantsRef.current.set(peerId, {
          peerId,
          name: userName,
          role: roleRef.current,
          isHost: asHost,
          speaking: false,
          handRaised: false,
          muted: false,
          online: true,
          lastSeen: Date.now(),
          videoEnabled: false,
        });
        updateParticipants();
      });

      peer.on("connection", (conn) => {
        if (participantsRef.current.size >= MAX_PARTICIPANTS) {
          try {
            conn.on("open", () => conn.send({ type: "room-full" }));
            conn.close();
          } catch {}
          return;
        }
        conn.on("open", () => {
          conn.send({
            type: "hello",
            name: userName,
            role: roleRef.current,
            isHost: isHostRef.current,
          });
        });

        conn.on("data", (data) => handleDataMessage(data, conn.peer));

        conn.on("close", () => {
          participantsRef.current.delete(conn.peer);
          connectionsRef.current.delete(conn.peer);
          updateParticipants();
          broadcastRoster();
        });
      });

      peer.on("call", (call) => {
        const meta = call.metadata as any;
        const isVideoCall = meta?.type === "video";

        if (isVideoCall) {
          if (!videoStreamRef.current) {
            call.close();
            return;
          }
          call.answer(videoStreamRef.current);
          setupVideoConnection(call, call.peer);
          return;
        }

        if (!streamRef.current) {
          call.close();
          return;
        }
        call.answer(streamRef.current);
        setupConnection(call, call.peer);

        const existing = participantsRef.current.get(call.peer);
        if (!existing) {
          const callerName = meta?.name || "Guest";
          participantsRef.current.set(call.peer, {
            peerId: call.peer,
            name: callerName,
            role: meta?.role || "listener",
            isHost: false,
            speaking: false,
            handRaised: false,
            muted: meta?.role !== "speaker",
            online: true,
            lastSeen: Date.now(),
            videoEnabled: false,
          });
          updateParticipants();
          autoAddContact(callerName, call.peer, addedContactsRef.current);
        }
      });

      peer.on("error", (err: any) => {
        if (err.type === "unavailable-id") {
          setState((s) => ({ ...s, error: "Room already exists. Joining instead..." }));
        } else if (err.type === "peer-unavailable") {
          // Target peer not found - normal during join
        } else {
          setState((s) => ({ ...s, error: err.message || String(err) }));
        }
      });

      peer.on("disconnected", () => {
        setState((s) => ({ ...s, connected: false }));
        try { peer.reconnect(); } catch {}
      });
    },
    [userName, setupConnection, handleDataMessage, updateParticipants, broadcastRoster]
  );

  const createRoom = useCallback(
    async (mode: WakkiiMode = "ptt", role: WakkiiRole = "speaker") => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        streamRef.current = stream;
        stream.getAudioTracks().forEach((t) => (t.enabled = false));

        const roomId = generateRoomId();
        modeRef.current = mode;
        roleRef.current = role;

        setState((s) => ({
          ...s,
          roomId,
          mode,
          role,
          isHost: true,
          micEnabled: false,
        }));

        setRoomHash(roomId);
        initPeer(roomId, true);
      } catch (e: any) {
        setState((s) => ({ ...s, error: "Microphone access denied: " + e.message }));
      }
    },
    [initPeer]
  );

  const joinRoom = useCallback(
    async (roomId: string, role: WakkiiRole = "speaker") => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        streamRef.current = stream;
        stream.getAudioTracks().forEach((t) => (t.enabled = false));

        const cleanRoomId = roomId.toUpperCase().replace(/[^A-Z0-9]/g, "");
        roleRef.current = role;

        setState((s) => ({
          ...s,
          roomId: cleanRoomId,
          role,
          isHost: false,
          micEnabled: false,
        }));

        setRoomHash(cleanRoomId);

        const myPeerId = `${PEER_PREFIX}${cleanRoomId}-${Math.random().toString(36).slice(2, 8)}`;
        const peer = new Peer(myPeerId, { debug: 1 });
        peerRef.current = peer;
        roomIdRef.current = cleanRoomId;
        isHostRef.current = false;

        peer.on("open", () => {
          setState((s) => ({ ...s, connected: true, error: null }));

          participantsRef.current.set(myPeerId, {
            peerId: myPeerId,
            name: userName,
            role,
            isHost: false,
            speaking: false,
            handRaised: false,
            muted: false,
            online: true,
            lastSeen: Date.now(),
            videoEnabled: false,
          });
          updateParticipants();

          const hostPeerId = `${PEER_PREFIX}${cleanRoomId}`;
          connectToPeer(hostPeerId);
        });

        peer.on("connection", (conn) => {
          if (participantsRef.current.size >= MAX_PARTICIPANTS) {
            try {
              conn.on("open", () => conn.send({ type: "room-full" }));
              conn.close();
            } catch {}
            setState((s) => ({ ...s, error: "Room is full (8 people max). Try creating a new room." }));
            return;
          }
          conn.on("open", () => {
            conn.send({
              type: "hello",
              name: userName,
              role: roleRef.current,
              isHost: false,
            });
          });
          conn.on("data", (data) => handleDataMessage(data, conn.peer));
          conn.on("close", () => {
            participantsRef.current.delete(conn.peer);
            connectionsRef.current.delete(conn.peer);
            updateParticipants();
          });
        });

        peer.on("call", (call) => {
          const meta = call.metadata as any;
          if (meta?.type === "video") {
            if (!videoStreamRef.current) { call.close(); return; }
            call.answer(videoStreamRef.current);
            setupVideoConnection(call, call.peer);
            return;
          }
          if (!streamRef.current) { call.close(); return; }
          call.answer(streamRef.current);
          setupConnection(call, call.peer);
        });

        peer.on("error", (err: any) => {
          if (err.type === "peer-unavailable") {
            setState((s) => ({ ...s, error: "Room not found. Check the link and try again." }));
          } else {
            setState((s) => ({ ...s, error: err.message || String(err) }));
          }
        });

        peer.on("disconnected", () => {
          setState((s) => ({ ...s, connected: false }));
          try { peer.reconnect(); } catch {}
        });
      } catch (e: any) {
        setState((s) => ({ ...s, error: "Microphone access denied: " + e.message }));
      }
    },
    [userName, connectToPeer, setupConnection, handleDataMessage, updateParticipants]
  );

  const setMicEnabled = useCallback((enabled: boolean) => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => (t.enabled = enabled));
    }
    setState((s) => ({ ...s, micEnabled: enabled }));

    connectionsRef.current.forEach((conn) => {
      try {
        conn.send({ type: enabled ? "ptt-start" : "ptt-stop" });
      } catch {}
    });
  }, []);

  const pushToTalkStart = useCallback(() => {
    setMicEnabled(true);
  }, [setMicEnabled]);

  const pushToTalkStop = useCallback(() => {
    setMicEnabled(false);
  }, [setMicEnabled]);

  const raiseHand = useCallback((raised: boolean) => {
    connectionsRef.current.forEach((conn) => {
      try {
        conn.send({ type: "raise-hand", raised });
      } catch {}
    });
    const myPeerId = peerRef.current?.id;
    if (myPeerId) {
      const me = participantsRef.current.get(myPeerId);
      if (me) {
        me.handRaised = raised;
        participantsRef.current.set(myPeerId, me);
        updateParticipants();
      }
    }
  }, [updateParticipants]);

  const approveSpeaker = useCallback((peerId: string) => {
    const conn = connectionsRef.current.get(peerId);
    if (conn) {
      try {
        conn.send({ type: "role-change", role: "speaker" });
      } catch {}
    }
    const p = participantsRef.current.get(peerId);
    if (p) {
      p.role = "speaker";
      p.muted = false;
      p.handRaised = false;
      participantsRef.current.set(peerId, p);
      updateParticipants();
    }
  }, [updateParticipants]);

  const toggleVideo = useCallback(async () => {
    if (state.videoEnabled) {
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach((t) => t.stop());
        videoStreamRef.current = null;
      }
      videoCallsRef.current.forEach((call) => { try { call.close(); } catch {} });
      videoCallsRef.current.clear();
      videoElementsRef.current.forEach((v) => { v.srcObject = null; });
      videoElementsRef.current.clear();
      const myPeerId = peerRef.current?.id;
      if (myPeerId) {
        const me = participantsRef.current.get(myPeerId);
        if (me) {
          me.videoEnabled = false;
          participantsRef.current.set(myPeerId, me);
        }
      }
      connectionsRef.current.forEach((conn) => {
        try { conn.send({ type: "video-off" }); } catch {}
      });
      setState((s) => ({ ...s, videoEnabled: false }));
      updateParticipants();
    } else {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        videoStreamRef.current = videoStream;
        const myPeerId = peerRef.current?.id;
        if (myPeerId) {
          const me = participantsRef.current.get(myPeerId);
          if (me) {
            me.videoEnabled = true;
            participantsRef.current.set(myPeerId, me);
          }
        }
        connectionsRef.current.forEach((conn) => {
          try { conn.send({ type: "video-on" }); } catch {}
        });
        setState((s) => ({ ...s, videoEnabled: true }));
        updateParticipants();
        broadcastVideoToAll();
      } catch (e: any) {
        setState((s) => ({ ...s, error: "Camera access denied: " + e.message }));
      }
    }
  }, [state.videoEnabled, broadcastVideoToAll, updateParticipants]);

  const getRemoteVideoStream = useCallback((peerId: string): MediaStream | null => {
    const video = videoElementsRef.current.get(peerId);
    return video?.srcObject as MediaStream | null;
  }, []);

  const getLocalVideoStream = useCallback((): MediaStream | null => {
    return videoStreamRef.current;
  }, []);

  const leaveRoom = useCallback(() => {
    connectionsRef.current.forEach((conn) => {
      try { conn.close(); } catch {}
    });
    connectionsRef.current.clear();
    videoCallsRef.current.forEach((call) => {
      try { call.close(); } catch {}
    });
    videoCallsRef.current.clear();
    participantsRef.current.clear();
    audioElementsRef.current.forEach((a) => { a.srcObject = null; });
    audioElementsRef.current.clear();
    videoElementsRef.current.forEach((v) => { v.srcObject = null; });
    videoElementsRef.current.clear();

    linkedRoomsRef.current.forEach((p) => { try { p.destroy(); } catch {} });
    linkedRoomsRef.current.clear();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((t) => t.stop());
      videoStreamRef.current = null;
    }
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch {}
      peerRef.current = null;
    }

    clearRoomHash();
    clearPresence(userName);
    setState({
      roomId: "",
      mode: "ptt",
      role: "speaker",
      isHost: false,
      participants: [],
      connected: false,
      error: null,
      micEnabled: false,
      videoEnabled: false,
    });
  }, [userName]);

  const linkRoom = useCallback((roomId: string) => {
    if (!peerRef.current || roomId === state.roomId) return;
    if (linkedRoomsRef.current.has(roomId)) return;

    const linkedPeerId = `${PEER_PREFIX}${roomId}-link-${Math.random().toString(36).slice(2, 6)}`;
    const linkedPeer = new Peer(linkedPeerId, { debug: 1 });

    linkedPeer.on("open", () => {
      const hostPeerId = `${PEER_PREFIX}${roomId}`;
      const conn = linkedPeer.connect(hostPeerId, {
        metadata: { name: `${userName} (linked)`, role: "listener", isHost: false },
      });

      conn.on("open", () => {
        conn.send({ type: "hello", name: `${userName} (linked)`, role: "listener", isHost: false });
        if (streamRef.current) {
          const call = linkedPeer.call(hostPeerId, streamRef.current, {
            metadata: { name: `${userName} (linked)`, role: "listener" },
          });
          if (call) {
            call.on("stream", (remote) => {
              let audio = audioElementsRef.current.get(`link-${roomId}`);
              if (!audio) {
                audio = new Audio();
                audio.autoplay = true;
                audioElementsRef.current.set(`link-${roomId}`, audio);
              }
              audio.srcObject = remote;
              audio.play().catch(() => {});
            });
          }
        }
      });

      conn.on("data", (data) => handleDataMessage(data, `link-${roomId}`));
    });

    linkedPeer.on("call", (call) => {
      if (streamRef.current) call.answer(streamRef.current);
      else call.close();
    });

    linkedRoomsRef.current.set(roomId, linkedPeer);
  }, [state.roomId, userName, handleDataMessage]);

  const unlinkRoom = useCallback((roomId: string) => {
    const peer = linkedRoomsRef.current.get(roomId);
    if (peer) { try { peer.destroy(); } catch {} }
    linkedRoomsRef.current.delete(roomId);
    const audio = audioElementsRef.current.get(`link-${roomId}`);
    if (audio) { audio.srcObject = null; audioElementsRef.current.delete(`link-${roomId}`); }
  }, []);

  const getLinkedRooms = useCallback(() => {
    return Array.from(linkedRoomsRef.current.keys());
  }, []);

  useEffect(() => {
    return () => {
      connectionsRef.current.forEach((conn) => { try { conn.close(); } catch {} });
      videoCallsRef.current.forEach((call) => { try { call.close(); } catch {} });
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (videoStreamRef.current) videoStreamRef.current.getTracks().forEach((t) => t.stop());
      if (peerRef.current) { try { peerRef.current.destroy(); } catch {} }
      clearPresence(userName);
    };
  }, [userName]);

  useEffect(() => {
    if (!state.roomId) return;
    const heartbeat = setInterval(() => {
      connectionsRef.current.forEach((conn) => {
        try {
          if (conn.open) conn.send({ type: "heartbeat", name: userName, ts: Date.now() });
        } catch {}
      });
      const myPeerId = peerRef.current?.id;
      if (myPeerId) {
        const me = participantsRef.current.get(myPeerId);
        if (me) {
          me.online = true;
          me.lastSeen = Date.now();
          participantsRef.current.set(myPeerId, me);
        }
      }
      updatePresence(userName, state.roomId);
    }, 5000);

    const presenceCheck = setInterval(() => {
      const now = Date.now();
      let changed = false;
      participantsRef.current.forEach((p, id) => {
        const wasOnline = p.online;
        p.online = wasOnline && (now - p.lastSeen < 15000);
        if (wasOnline !== p.online) changed = true;
      });
      if (changed) updateParticipants();
    }, 3000);

    return () => {
      clearInterval(heartbeat);
      clearInterval(presenceCheck);
    };
  }, [state.roomId, userName, updateParticipants]);

  return {
    state,
    createRoom,
    joinRoom,
    leaveRoom,
    pushToTalkStart,
    pushToTalkStop,
    setMicEnabled,
    raiseHand,
    approveSpeaker,
    toggleVideo,
    getLocalVideoStream,
    getRemoteVideoStream,
    linkRoom,
    unlinkRoom,
    getLinkedRooms,
    shareUrl: state.roomId ? `${APP_BASE_URL}/#wakkii-${state.roomId}` : "",
  };
}
