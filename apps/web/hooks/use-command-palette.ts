"use client";

import { useState, useEffect, useCallback } from "react";

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + . (command mode), Ctrl+Shift+P, or Ctrl+J
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.key === ".") {
        e.preventDefault();
        setInitialQuery(">");
        setOpen((prev) => !prev);
      } else if (e.ctrlKey && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setInitialQuery("");
        setOpen((prev) => !prev);
      } else if (e.ctrlKey && e.key === "j") {
        e.preventDefault();
        setInitialQuery("");
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const openPalette = useCallback((query = "") => {
    setInitialQuery(query);
    setOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setInitialQuery("");
  }, []);

  return {
    open,
    setOpen,
    initialQuery,
    openPalette,
    closePalette,
  };
}
