import React, { Component, ErrorInfo, ReactNode } from "react";
interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}
interface State {
    hasError: boolean;
    error?: Error;
}
export declare class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props);
    static getDerivedStateFromError(error: Error): State;
    componentDidCatch(error: Error, errorInfo: ErrorInfo): void;
    handleRetry: () => void;
    render(): string | number | bigint | boolean | React.JSX.Element | Iterable<React.ReactNode> | Promise<string | number | bigint | boolean | React.ReactPortal | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | null | undefined> | null | undefined;
}
export declare function useErrorBoundary(): {
    captureError: (error: Error) => void;
    resetError: () => void;
};
export declare function withErrorBoundary<P extends object>(Component: React.ComponentType<P>, fallback?: ReactNode, onError?: (error: Error, errorInfo: ErrorInfo) => void): {
    (props: P): React.JSX.Element;
    displayName: string;
};
export {};
//# sourceMappingURL=error-boundary.d.ts.map