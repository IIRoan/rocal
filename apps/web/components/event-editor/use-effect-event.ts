import { useInsertionEffect, useRef, useState } from "react";

export function useEffectEvent<T extends (...args: never[]) => unknown>(
  callback: T,
): T {
  const callbackRef = useRef(callback);
  const [stable] = useState(
    () => ((...args: never[]) => callbackRef.current(...args)) as T,
  );

  useInsertionEffect(() => {
    callbackRef.current = callback;
  });

  return stable;
}
