import { useRef, useEffect } from "react";

interface JarvisWaveformProps {
  frequencyData: Uint8Array;
  audioLevel: number;
  isListening: boolean;
  isSpeaking: boolean;
  size?: number;
}

export function JarvisWaveform({ frequencyData, audioLevel, isListening, isSpeaking, size = 120 }: JarvisWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const baseRadius = size * 0.18;
    const maxBarLength = size * 0.28;
    const numBars = 48;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      phaseRef.current += 0.02;

      const active = isListening || isSpeaking;
      const level = active ? Math.max(audioLevel, 0.05) : 0;

      // Color based on state — warm-ink palette
      let primary: string, glow: string;
      if (isSpeaking) {
        primary = "#FFA726";
        glow = "rgba(255, 167, 38, 0.4)";
      } else if (isListening) {
        primary = "#C6AC8F";
        glow = "rgba(198, 172, 143, 0.4)";
      } else {
        primary = "#C6AC8F";
        glow = "rgba(198, 172, 143, 0.2)";
      }

      // Outer glow ring
      const glowRadius = baseRadius + 8 + Math.sin(phaseRef.current) * 3 * (active ? 1 : 0.3);
      const gradient = ctx.createRadialGradient(cx, cy, baseRadius, cx, cy, glowRadius + 20);
      gradient.addColorStop(0, glow);
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius + 20, 0, Math.PI * 2);
      ctx.fill();

      // Center circle
      ctx.fillStyle = primary;
      ctx.globalAlpha = active ? 0.9 : 0.4;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * (1 + level * 0.3), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Inner pulse ring
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = active ? 0.6 : 0.2;
      const pulseR = baseRadius * (1.3 + Math.sin(phaseRef.current * 2) * 0.1);
      ctx.beginPath();
      ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Frequency bars radiating outward
      const bins = frequencyData.length;
      for (let i = 0; i < numBars; i++) {
        const angle = (i / numBars) * Math.PI * 2 - Math.PI / 2;
        const binIndex = Math.floor((i / numBars) * bins);
        const amplitude = active ? frequencyData[binIndex] / 255 : 0;

        // Idle animation
        const idleWave = Math.sin(phaseRef.current * 2 + i * 0.3) * 0.15 + 0.15;
        const barLength = active
          ? Math.max(amplitude * maxBarLength, 2)
          : idleWave * maxBarLength * 0.3;

        const innerR = baseRadius + 4;
        const outerR = innerR + barLength;

        const x1 = cx + Math.cos(angle) * innerR;
        const y1 = cy + Math.sin(angle) * innerR;
        const x2 = cx + Math.cos(angle) * outerR;
        const y2 = cy + Math.sin(angle) * outerR;

        ctx.strokeStyle = primary;
        ctx.lineWidth = 2;
        ctx.globalAlpha = active ? Math.max(amplitude * 0.9, 0.3) : 0.25;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Arc reactor style inner glow
      if (active) {
        const innerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius);
        innerGlow.addColorStop(0, "rgba(255, 255, 255, 0.3)");
        innerGlow.addColorStop(0.5, glow);
        innerGlow.addColorStop(1, "transparent");
        ctx.fillStyle = innerGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [frequencyData, audioLevel, isListening, isSpeaking, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="pointer-events-none"
    />
  );
}
