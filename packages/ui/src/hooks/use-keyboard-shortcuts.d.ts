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
export declare function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], options?: UseKeyboardShortcutsOptions): void;
/**
 * Simplified hook for dropdown shortcuts that automatically handles Cmd/Ctrl modifiers
 */
export declare function useDropdownShortcuts(shortcuts: Array<{
    key: string;
    action: () => void;
}>, enabled?: boolean): void;
/**
 * Hook for numbered shortcuts (1-9) with Cmd/Ctrl modifier
 */
export declare function useNumberedShortcuts(actions: Array<() => void>, enabled?: boolean): void;
//# sourceMappingURL=use-keyboard-shortcuts.d.ts.map