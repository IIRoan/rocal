import { useEffect, useState } from "react";

export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !("visualViewport" in window)) {
      return;
    }

    const visualViewport = window.visualViewport as VisualViewport;
    let animationFrameId: number;

    const handleResize = () => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        const keyboardSize = Math.max(
          0,
          window.innerHeight - visualViewport.height,
        );
        setKeyboardHeight(keyboardSize);
      });
    };

    visualViewport.addEventListener("resize", handleResize);
    visualViewport.addEventListener("scroll", handleResize);
    handleResize();

    return () => {
      cancelAnimationFrame(animationFrameId);
      visualViewport.removeEventListener("resize", handleResize);
      visualViewport.removeEventListener("scroll", handleResize);
    };
  }, []);

  return keyboardHeight;
}