import * as React from "react";

interface UseIsInViewOptions {
  inView?: boolean;
  inViewOnce?: boolean;
  inViewMargin?: string;
}

function useIsInView<T extends HTMLElement = HTMLElement>(
  ref: React.Ref<T>,
  options: UseIsInViewOptions = {},
) {
  const { inView, inViewOnce = false, inViewMargin = "0px" } = options;
  const localRef = React.useRef<T>(null);
  const [isInView, setIsInView] = React.useState(!inView);

  React.useImperativeHandle(ref, () => localRef.current as T);

  React.useEffect(() => {
    if (!inView) {
      setIsInView(true);
      return;
    }

    const element = localRef.current;

    if (!element || typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);

          if (inViewOnce) {
            observer.disconnect();
          }

          return;
        }

        if (!inViewOnce) {
          setIsInView(false);
        }
      },
      { rootMargin: inViewMargin },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [inView, inViewMargin, inViewOnce]);

  return { ref: localRef, isInView };
}

export { useIsInView, type UseIsInViewOptions };
