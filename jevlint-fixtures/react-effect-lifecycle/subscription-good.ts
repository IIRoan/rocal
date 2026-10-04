import { useEffect } from "react";

declare function refreshClock(): void;

export function useClockRefresh(): void {
  useEffect(() => {
    const timer = setInterval(refreshClock, 1000);
    return () => clearInterval(timer);
  }, []);
}
