import React from "react";
interface LoadingState {
    id: string;
    message?: string;
    variant?: "minimal" | "detailed" | "splash";
    priority?: number;
}
interface LoadingContextType {
    isLoading: boolean;
    loadingStates: LoadingState[];
    showLoading: (id: string, options?: {
        message?: string;
        variant?: "minimal" | "detailed" | "splash";
        priority?: number;
    }) => void;
    hideLoading: (id: string) => void;
    clearAllLoading: () => void;
    showPageLoading: (message?: string) => void;
    hidePageLoading: () => void;
    showSplashLoading: (message?: string) => void;
    hideSplashLoading: () => void;
}
interface LoadingProviderProps {
    children: React.ReactNode;
    defaultVariant?: "minimal" | "detailed" | "splash";
}
export declare function LoadingProvider({ children, defaultVariant, }: LoadingProviderProps): React.JSX.Element;
export declare function useLoading(): LoadingContextType;
export declare function useLoadingOperation(): {
    executeWithLoading: <T>(operation: () => Promise<T>, options: {
        id: string;
        message?: string;
        variant?: "minimal" | "detailed" | "splash";
        priority?: number;
    }) => Promise<T>;
};
export declare function useComponentLoading(componentId: string): {
    isLoading: boolean;
    setLoading: (loading: boolean, options?: {
        message?: string;
        variant?: "minimal" | "detailed" | "splash";
        priority?: number;
    }) => void;
};
export {};
//# sourceMappingURL=loading-provider.d.ts.map