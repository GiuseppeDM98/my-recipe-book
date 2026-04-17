'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Countdown timer hook — supporta più timer in parallelo.
 *
 * Ogni timer è identificato dallo stepId del passo che lo ha avviato.
 * Avviare un timer per uno step già attivo lo azzera e riparte da capo.
 *
 * Ogni interval è gestito indipendentemente; la pulizia avviene
 * automaticamente quando il timer scade o viene fermato manualmente.
 */

export interface ActiveTimer {
  stepId: string;
  secondsLeft: number;
}

export interface StartTimerOptions {
  /** Chiamato una volta sola quando il countdown arriva a zero */
  onFinish?: () => void;
}

export interface CountdownTimerControls {
  /** Avvia (o riavvia) il timer per il dato step */
  start: (stepId: string, durationSeconds: number, options?: StartTimerOptions) => void;
  /** Ferma il timer di uno step specifico */
  stop: (stepId: string) => void;
  /** Ferma tutti i timer attivi */
  stopAll: () => void;
  /** Restituisce i secondi rimanenti per uno step (0 se non attivo) */
  getSecondsLeft: (stepId: string) => number;
  /** True se il timer per questo step è in esecuzione */
  isActive: (stepId: string) => boolean;
}

export interface CountdownTimerState {
  /** Lista di tutti i timer attivi con i secondi rimanenti */
  timers: ActiveTimer[];
}

export function useCountdownTimer(): CountdownTimerState & CountdownTimerControls {
  // secondsMap: stepId → secondi rimanenti; fonte di verità per i render
  const [secondsMap, setSecondsMap] = useState<Record<string, number>>({});

  // Refs stabili — non causano re-render
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const onFinishRefs = useRef<Map<string, (() => void) | undefined>>(new Map());

  const stop = useCallback((stepId: string) => {
    const interval = intervalsRef.current.get(stepId);
    if (interval !== undefined) {
      clearInterval(interval);
      intervalsRef.current.delete(stepId);
    }
    onFinishRefs.current.delete(stepId);
    setSecondsMap((prev) => {
      const next = { ...prev };
      delete next[stepId];
      return next;
    });
  }, []);

  const stopAll = useCallback(() => {
    intervalsRef.current.forEach((interval) => clearInterval(interval));
    intervalsRef.current.clear();
    onFinishRefs.current.clear();
    setSecondsMap({});
  }, []);

  const start = useCallback(
    (stepId: string, durationSeconds: number, options?: StartTimerOptions) => {
      // Se c'è già un timer per questo step, cancellalo prima di ripartire
      const existing = intervalsRef.current.get(stepId);
      if (existing !== undefined) {
        clearInterval(existing);
      }

      onFinishRefs.current.set(stepId, options?.onFinish);
      setSecondsMap((prev) => ({ ...prev, [stepId]: durationSeconds }));

      const interval = setInterval(() => {
        setSecondsMap((prev) => {
          const current = prev[stepId] ?? 0;
          if (current <= 1) {
            // Timer scaduto: pulisci e chiama onFinish
            clearInterval(intervalsRef.current.get(stepId)!);
            intervalsRef.current.delete(stepId);
            onFinishRefs.current.get(stepId)?.();
            onFinishRefs.current.delete(stepId);
            const next = { ...prev };
            delete next[stepId];
            return next;
          }
          return { ...prev, [stepId]: current - 1 };
        });
      }, 1000);

      intervalsRef.current.set(stepId, interval);
    },
    []
  );

  // Pulizia completa allo smontaggio del componente
  useEffect(() => {
    return () => {
      intervalsRef.current.forEach((interval) => clearInterval(interval));
    };
  }, []);

  const timers: ActiveTimer[] = Object.entries(secondsMap).map(([stepId, secondsLeft]) => ({
    stepId,
    secondsLeft,
  }));

  const getSecondsLeft = useCallback(
    (stepId: string): number => secondsMap[stepId] ?? 0,
    [secondsMap]
  );

  const isActive = useCallback(
    (stepId: string): boolean => stepId in secondsMap,
    [secondsMap]
  );

  return { timers, start, stop, stopAll, getSecondsLeft, isActive };
}
