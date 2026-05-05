import { useEffect, useMemo, useState } from "react";

interface UseDrawerViewportOptions {
  enabled?: boolean;
  keyboardAware?: boolean;
  responsiveHeight?: string;
}

export function useDrawerViewport({
  enabled = true,
  keyboardAware = true,
  responsiveHeight = "92dvh",
}: UseDrawerViewportOptions = {}) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (
      !enabled ||
      typeof window === "undefined" ||
      !("visualViewport" in window)
    ) {
      setKeyboardHeight(0);
      return;
    }

    const visualViewport = window.visualViewport as VisualViewport;
    let animationFrameId = 0;

    const handleResize = () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = requestAnimationFrame(() => {
        const nextKeyboardHeight = Math.max(
          0,
          window.innerHeight - visualViewport.height,
        );
        setKeyboardHeight(nextKeyboardHeight);
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
  }, [enabled]);

  return useMemo(() => {
    if (!enabled) {
      return {
        keyboardHeight: 0,
        viewportStyle: undefined,
      };
    }

    const activeKeyboardHeight = keyboardAware ? keyboardHeight : 0;
    const viewportHeight =
      activeKeyboardHeight > 0
        ? `calc(100dvh - ${activeKeyboardHeight}px)`
        : responsiveHeight;

    return {
      keyboardHeight: activeKeyboardHeight,
      viewportStyle: {
        bottom: activeKeyboardHeight,
        height: viewportHeight,
        maxHeight: viewportHeight,
      },
    };
  }, [enabled, keyboardAware, keyboardHeight, responsiveHeight]);
}
