/**
 * useIdleTimer — Logs out user after period of inactivity
 *
 * Monitors mouse, keyboard, and touch events. Resets the timer
 * on any interaction. Logs out via callback when idle threshold
 * is exceeded.
 */

import { useEffect, useRef, useCallback } from 'react';

const IDLE_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'wheel'];

export function useIdleTimer(
  onIdle: () => void,
  timeoutMinutes: number
) {
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleRef = useRef(onIdle);

  // Keep callback ref fresh
  onIdleRef.current = onIdle;

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (timeoutMs > 0) {
      timerRef.current = setTimeout(() => {
        onIdleRef.current();
      }, timeoutMs);
    }
  }, [timeoutMs]);

  useEffect(() => {
    if (timeoutMs <= 0) return;

    resetTimer();

    const events = IDLE_EVENTS;
    const handler = () => resetTimer();

    events.forEach((evt) => document.addEventListener(evt, handler, { passive: true }));

    return () => {
      events.forEach((evt) => document.removeEventListener(evt, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer, timeoutMs]);

  return { resetTimer };
}
