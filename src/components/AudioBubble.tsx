"use client";

import { useEffect, useRef, useCallback } from "react";

interface AudioBubbleProps {
  /** The audio element to visualize. When null, shows idle state. */
  audioElement: HTMLAudioElement | null;
  /** Whether the AI is currently speaking */
  isSpeaking: boolean;
  /** Whether the user is currently recording */
  isRecording: boolean;
  /** Size in px (width & height) */
  size?: number;
}

export default function AudioBubble({
  audioElement,
  isSpeaking,
  isRecording,
  size = 200,
}: AudioBubbleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // Connect audio element to analyser when it changes
  useEffect(() => {
    if (!audioElement) return;

    // Reuse or create AudioContext
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;

    // Create analyser
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;

    // Only create a new source if we haven't connected this element yet
    if (!sourceRef.current) {
      try {
        const source = ctx.createMediaElementSource(audioElement);
        source.connect(analyser);
        analyser.connect(ctx.destination);
        sourceRef.current = source;
      } catch {
        // Element may already be connected — just reconnect analyser
        analyserRef.current = null;
      }
    } else {
      sourceRef.current.disconnect();
      sourceRef.current.connect(analyser);
      analyser.connect(ctx.destination);
    }

    return () => {
      analyser.disconnect();
    };
  }, [audioElement]);

  // Animation loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const baseRadius = w * 0.28;

    ctx.clearRect(0, 0, w, h);

    // Get amplitude from analyser or use synthetic values
    let amplitude = 0;
    if (isSpeaking && analyserRef.current && dataArrayRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      const sum = dataArrayRef.current.reduce((s, v) => s + v, 0);
      amplitude = sum / dataArrayRef.current.length / 255; // 0-1
    } else if (isRecording) {
      // Gentle pulse for recording state
      amplitude = 0.15 + Math.sin(Date.now() / 200) * 0.1;
    }

    const time = Date.now() / 1000;

    // ── Outer glow ──
    const glowRadius = baseRadius + 30 + amplitude * 40;
    const gradient = ctx.createRadialGradient(cx, cy, baseRadius * 0.5, cx, cy, glowRadius);
    if (isRecording) {
      gradient.addColorStop(0, `rgba(239, 68, 68, ${0.08 + amplitude * 0.12})`);
      gradient.addColorStop(1, "rgba(239, 68, 68, 0)");
    } else if (isSpeaking) {
      gradient.addColorStop(0, `rgba(139, 92, 246, ${0.08 + amplitude * 0.15})`);
      gradient.addColorStop(1, "rgba(139, 92, 246, 0)");
    } else {
      gradient.addColorStop(0, "rgba(139, 92, 246, 0.05)");
      gradient.addColorStop(1, "rgba(139, 92, 246, 0)");
    }
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // ── Draw organic blob ──
    const points = 64;
    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;

      // Multiple sine waves for organic feel
      const wave1 = Math.sin(angle * 3 + time * 2) * amplitude * 15;
      const wave2 = Math.sin(angle * 5 - time * 3) * amplitude * 8;
      const wave3 = Math.sin(angle * 7 + time * 1.5) * amplitude * 5;
      const breathe = Math.sin(time * 1.2) * 3;

      const r = baseRadius + wave1 + wave2 + wave3 + breathe;

      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Fill with gradient
    const blobGrad = ctx.createRadialGradient(
      cx - baseRadius * 0.3,
      cy - baseRadius * 0.3,
      0,
      cx,
      cy,
      baseRadius + amplitude * 20
    );
    if (isRecording) {
      blobGrad.addColorStop(0, "rgba(239, 68, 68, 0.6)");
      blobGrad.addColorStop(0.6, "rgba(220, 38, 38, 0.4)");
      blobGrad.addColorStop(1, "rgba(185, 28, 28, 0.2)");
    } else if (isSpeaking) {
      blobGrad.addColorStop(0, "rgba(167, 139, 250, 0.6)");
      blobGrad.addColorStop(0.6, "rgba(139, 92, 246, 0.4)");
      blobGrad.addColorStop(1, "rgba(109, 40, 217, 0.2)");
    } else {
      blobGrad.addColorStop(0, "rgba(167, 139, 250, 0.25)");
      blobGrad.addColorStop(0.6, "rgba(139, 92, 246, 0.15)");
      blobGrad.addColorStop(1, "rgba(109, 40, 217, 0.08)");
    }
    ctx.fillStyle = blobGrad;
    ctx.fill();

    // ── Inner highlight ring ──
    ctx.strokeStyle = isRecording
      ? `rgba(248, 113, 113, ${0.3 + amplitude * 0.4})`
      : `rgba(196, 181, 253, ${0.2 + amplitude * 0.4})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── Center icon area (microphone or speaker indicator) ──
    const iconSize = baseRadius * 0.3;
    ctx.save();
    ctx.translate(cx, cy);

    if (isRecording) {
      // Pulsing mic dot
      const pulse = 1 + Math.sin(time * 4) * 0.15;
      ctx.beginPath();
      ctx.arc(0, 0, iconSize * 0.3 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(239, 68, 68, 0.8)";
      ctx.fill();
    } else if (isSpeaking) {
      // Sound wave bars
      const bars = 5;
      const barWidth = iconSize * 0.12;
      const gap = iconSize * 0.22;
      const startX = -((bars - 1) * gap) / 2;
      for (let i = 0; i < bars; i++) {
        const barH =
          iconSize * 0.3 +
          Math.sin(time * 4 + i * 0.8) * iconSize * 0.4 * amplitude;
        ctx.fillStyle = `rgba(196, 181, 253, ${0.5 + amplitude * 0.5})`;
        ctx.fillRect(
          startX + i * gap - barWidth / 2,
          -barH / 2,
          barWidth,
          barH
        );
      }
    } else {
      // Idle: subtle dot
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(167, 139, 250, 0.3)";
      ctx.fill();
    }

    ctx.restore();

    animFrameRef.current = requestAnimationFrame(draw);
  }, [isSpeaking, isRecording]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  return (
    <canvas
      ref={canvasRef}
      width={size * dpr}
      height={size * dpr}
      style={{ width: size, height: size }}
      className="pointer-events-none"
    />
  );
}
