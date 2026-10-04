import { useEffect } from "react";

declare function refreshClock(): void;

export function useClockRefresh(): void {
  useEffect(() => {
    setInterval(refreshClock, 1000);
  }, []);
}
