"use client";

import { Component, ErrorInfo, ReactNode } from "react";
import { createLogger } from "@workspace/logger";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./button";

const log = createLogger("error-boundary");

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    log.error("ErrorBoundary caught an error:", error, errorInfo);

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
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex size-16 items-center justify-center bg-destructive/10 rounded-full">
            <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Unable to show this section</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Try again. If the problem continues, reload the page or contact
              support.
            </p>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-sm font-medium">
                  Error details (development only)
                </summary>
                <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
          <Button
            onClick={this.handleRetry}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
