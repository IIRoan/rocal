interface GlobalLoadingScreenProps {
    isLoading?: boolean;
    message?: string;
    variant?: "minimal" | "detailed" | "splash";
    className?: string;
}
export declare function GlobalLoadingScreen({ isLoading, message, variant, className }: GlobalLoadingScreenProps): import("react").JSX.Element | null;
interface SectionLoadingProps {
    title?: string;
    description?: string;
    className?: string;
}
export declare function SectionLoading({ title, description, className }: SectionLoadingProps): import("react").JSX.Element;
interface LoadingOverlayProps {
    isLoading?: boolean;
    children: React.ReactNode;
    message?: string;
    className?: string;
}
export declare function LoadingOverlay({ isLoading, children, message, className }: LoadingOverlayProps): import("react").JSX.Element;
export type { GlobalLoadingScreenProps, SectionLoadingProps, LoadingOverlayProps };
//# sourceMappingURL=global-loading-screen.d.ts.map