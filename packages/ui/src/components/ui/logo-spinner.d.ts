import type { COMBINED_MESSAGES } from "../../constants/loading-messages";
interface LogoSpinnerProps {
    size?: "sm" | "md" | "lg" | "xl";
    className?: string;
    showText?: boolean;
    text?: string;
    messageContext?: keyof typeof COMBINED_MESSAGES;
    enableCycling?: boolean;
}
export declare function LogoSpinner({ size, className, showText, text, messageContext, enableCycling }: LogoSpinnerProps): import("react").JSX.Element;
interface PageLoadingOverlayProps {
    isLoading?: boolean;
    message?: string;
    messageContext?: keyof typeof COMBINED_MESSAGES;
    className?: string;
    enableCycling?: boolean;
}
export declare function PageLoadingOverlay({ isLoading, message, messageContext, className, enableCycling }: PageLoadingOverlayProps): import("react").JSX.Element | null;
interface InlineLogoSpinnerProps {
    className?: string;
    size?: "sm" | "md";
    text?: string;
    messageContext?: keyof typeof COMBINED_MESSAGES;
    enableCycling?: boolean;
}
export declare function InlineLogoSpinner({ className, size, text, messageContext, enableCycling }: InlineLogoSpinnerProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=logo-spinner.d.ts.map