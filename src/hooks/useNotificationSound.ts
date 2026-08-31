"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "cd.admin-sound-enabled";

/**
 * Beeps via Web Audio API (oscilador) — sem arquivo de áudio, sem asset,
 * sem problema de autoplay depois do primeiro gesto do usuário (unlock).
 */
export function useNotificationSound() {
  const [enabled, setEnabled] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      setEnabled(window.localStorage.getItem(STORAGE_KEY) !== "0");
    } catch {
      // storage indisponível — mantém default ligado
    }
  }, []);

  /** Deve ser chamado num gesto do usuário (clique) para liberar o áudio. */
  const unlock = useCallback(() => {
    try {
      ctxRef.current ??= new AudioContext();
      void ctxRef.current.resume().then(() => setUnlocked(true));
    } catch {
      // Web Audio indisponível — painel funciona sem som
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // noop
      }
      return next;
    });
  }, []);

  const beep = useCallback(
    (frequency: number, startOffset: number, duration: number) => {
      const ctx = ctxRef.current;
      if (!ctx || ctx.state !== "running") return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + startOffset;
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    },
    [],
  );

  /** Pedido novo normal: duas notas ascendentes curtas. */
  const playNew = useCallback(() => {
    if (!enabled) return;
    beep(660, 0, 0.15);
    beep(990, 0.18, 0.2);
  }, [enabled, beep]);

  /** Pedido aguardando confirmação: beep duplo agudo, mais urgente. */
  const playUrgent = useCallback(() => {
    if (!enabled) return;
    beep(1175, 0, 0.12);
    beep(1175, 0.2, 0.12);
    beep(880, 0.4, 0.25);
  }, [enabled, beep]);

  return { enabled, unlocked, unlock, toggle, playNew, playUrgent };
}
