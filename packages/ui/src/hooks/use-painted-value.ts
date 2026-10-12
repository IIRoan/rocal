"use client";

import { useEffect, useState } from "react";
import { afterPaint } from "@workspace/calendar-core";

/** Lags `value` until the render it triggered has painted, for CSS transitions keyed on it. */
export function usePaintedValue<T>(value: T): T {
  const [painted, setPainted] = useState(value);

  useEffect(() => {
    if (Object.is(value, painted)) return;
    return afterPaint(() => setPainted(value));
  }, [value, painted]);

  return painted;
}
