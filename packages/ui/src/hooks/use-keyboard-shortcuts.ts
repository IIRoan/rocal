"use client";

import { useEffect, useCallback } from "react";

export interface KeyboardShortcut {
  key: string;
  action: () => void;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

export interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  target?: HTMLElement | Document | null;
}

/**
 * Hook for handling keyboard shortcuts in dropdown menus and other components
 * Supports both Ctrl (Windows/Linux) and Cmd (Mac) modifier keys
 */
export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {}
) {
  const { enabled = true, target = document } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Find matching shortcut
      const matchingShortcut = shortcuts.find((shortcut) => {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = shortcut.ctrlKey ? event.ctrlKey || event.metaKey : true;
        const metaMatch = shortcut.metaKey ? event.ctrlKey || event.metaKey : true;
        const altMatch = shortcut.altKey ? event.altKey : !event.altKey;
        const shiftMatch = shortcut.shiftKey ? event.shiftKey : !event.shiftKey;

        return keyMatch && ctrlMatch && metaMatch && altMatch && shiftMatch;
      });

      if (matchingShortcut) {
        if (matchingShortcut.preventDefault !== false) {
          event.preventDefault();
        }
        if (matchingShortcut.stopPropagation !== false) {
          event.stopPropagation();
        }
        matchingShortcut.action();
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    if (!enabled || !target) return;

    target.addEventListener("keydown", handleKeyDown as EventListener);

    return () => {
      target.removeEventListener("keydown", handleKeyDown as EventListener);
    };
  }, [enabled, target, handleKeyDown]);
}

/**
 * Simplified hook for dropdown shortcuts that automatically handles Cmd/Ctrl modifiers
 */
export function useDropdownShortcuts(
  shortcuts: Array<{ key: string; action: () => void }>,
  enabled: boolean = true
) {
  const keyboardShortcuts: KeyboardShortcut[] = shortcuts.map((shortcut) => ({
    ...shortcut,
    ctrlKey: true, // This will match both Ctrl and Cmd
    preventDefault: true,
    stopPropagation: true,
  }));

  useKeyboardShortcuts(keyboardShortcuts, { enabled });
}

/**
 * Hook for numbered shortcuts (1-9) with Cmd/Ctrl modifier
 */
export function useNumberedShortcuts(
  actions: Array<() => void>,
  enabled: boolean = true
) {
  const shortcuts: KeyboardShortcut[] = actions.slice(0, 9).map((action, index) => ({
    key: String(index + 1),
    action,
    ctrlKey: true,
    preventDefault: true,
    stopPropagation: true,
  }));

  useKeyboardShortcuts(shortcuts, { enabled });
}