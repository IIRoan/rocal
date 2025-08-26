"use client";
import React, { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./button";
export class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error:", error, errorInfo);
        // Call the optional onError callback
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }
    }
    handleRetry = () => {
        this.setState({ hasError: false, error: undefined });
    };
    render() {
        if (this.state.hasError) {
            // Custom fallback UI
            if (this.props.fallback) {
                return this.props.fallback;
            }
            // Default error UI
            return (<div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
          <div className="flex items-center justify-center w-16 h-16 bg-destructive/10 rounded-full">
            <AlertTriangle className="w-8 h-8 text-destructive"/>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Something went wrong</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              An unexpected error occurred. Please try refreshing the page or
              contact support if the problem persists.
            </p>
            {process.env.NODE_ENV === "development" && this.state.error && (<details className="mt-4 text-left">
                <summary className="cursor-pointer text-sm font-medium">
                  Error details (development only)
                </summary>
                <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                  {this.state.error.stack}
                </pre>
              </details>)}
          </div>
          <Button onClick={this.handleRetry} variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4"/>
            Try again
          </Button>
        </div>);
        }
        return this.props.children;
    }
}
// Hook version for functional components
export function useErrorBoundary() {
    const [error, setError] = React.useState(null);
    const resetError = React.useCallback(() => {
        setError(null);
    }, []);
    const captureError = React.useCallback((error) => {
        setError(error);
    }, []);
    React.useEffect(() => {
        if (error) {
            throw error;
        }
    }, [error]);
    return { captureError, resetError };
}
// Higher-order component for wrapping components with error boundary
export function withErrorBoundary(Component, fallback, onError) {
    const WrappedComponent = (props) => (<ErrorBoundary fallback={fallback} onError={onError}>
      <Component {...props}/>
    </ErrorBoundary>);
    WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
    return WrappedComponent;
}
