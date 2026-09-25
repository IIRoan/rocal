import { useEffect, useState } from "react";

export function useCurrentDateTime(refreshMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      setNow(new Date());
    };

    const startInterval = () => {
      tick();
      intervalId = setInterval(tick, refreshMs);
    };

    const current = new Date();
    const delay = Math.max(
      0,
      refreshMs - (current.getTime() % refreshMs),
    );
    const timeoutId = setTimeout(startInterval, delay);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId != null) {
        clearInterval(intervalId);
      }
    };
  }, [refreshMs]);

  return now;
}
