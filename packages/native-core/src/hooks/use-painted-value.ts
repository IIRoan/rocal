import { useEffect, useState } from "react";
import { afterPaint } from "@workspace/calendar-core";

/** Native twin of `usePaintedValue` in @workspace/ui/hooks. */
export function usePaintedValue<T>(value: T): T {
  const [painted, setPainted] = useState(value);

  useEffect(() => {
    if (Object.is(value, painted)) return;
    return afterPaint(() => setPainted(value));
  }, [value, painted]);

  return painted;
}
