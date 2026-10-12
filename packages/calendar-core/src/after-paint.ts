// Web and React Native both provide frame callbacks; calendar-core compiles without either platform's globals.
declare function requestAnimationFrame(callback: () => void): number;
declare function cancelAnimationFrame(handle: number): void;

/** Runs `callback` once the next frame has painted, so motion never starts in the frame that renders its content. */
export function afterPaint(callback: () => void): () => void {
  let secondFrame: number | null = null;
  const firstFrame = requestAnimationFrame(() => {
    secondFrame = requestAnimationFrame(() => {
      secondFrame = null;
      callback();
    });
  });
  return () => {
    cancelAnimationFrame(firstFrame);
    if (secondFrame !== null) cancelAnimationFrame(secondFrame);
  };
}
