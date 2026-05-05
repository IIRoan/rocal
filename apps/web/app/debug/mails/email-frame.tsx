"use client";

import { useEffect, useRef, useState } from "react";

export function EmailFrame({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    function measure() {
      try {
        const doc = iframe!.contentDocument;
        if (doc?.documentElement) {
          const h = doc.documentElement.scrollHeight || doc.body?.scrollHeight || 400;
          setHeight(h);
        }
      } catch {
        // srcdoc is same-origin, this shouldn't fire
      }
    }

    iframe.addEventListener("load", measure);

    // Re-measure if the inner document resizes (e.g. images load)
    let observer: ResizeObserver | undefined;
    const handleLoad = () => {
      measure();
      try {
        const doc = iframe!.contentDocument;
        if (doc?.body) {
          observer = new ResizeObserver(measure);
          observer.observe(doc.body);
        }
      } catch {
        // ignore
      }
    };
    iframe.addEventListener("load", handleLoad);

    return () => {
      iframe.removeEventListener("load", measure);
      iframe.removeEventListener("load", handleLoad);
      observer?.disconnect();
    };
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      title="Email preview"
      className="w-full border-0"
      style={{ height, minHeight: 400 }}
      sandbox="allow-same-origin"
    />
  );
}
