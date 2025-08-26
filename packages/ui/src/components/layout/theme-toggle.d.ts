interface ThemeToggleProps {
    useSettingsTheme?: {
        currentTheme: "light" | "dark" | "system";
        updateTheme: (theme: "light" | "dark" | "system") => Promise<void>;
    };
}
export declare function ThemeToggle({ useSettingsTheme }?: ThemeToggleProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=theme-toggle.d.ts.map