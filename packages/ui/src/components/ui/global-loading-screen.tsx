"use client";

import { cn } from "../../lib/utils";
import { Skeleton } from "./skeleton";
import { useEffect, useState } from "react";

interface GlobalLoadingScreenProps {
  isLoading?: boolean;
  message?: string;
  variant?: "minimal" | "detailed" | "splash";
  className?: string;
}

export function GlobalLoadingScreen({ 
  isLoading = true, 
  message = "Loading...", 
  variant = "detailed",
  className 
}: GlobalLoadingScreenProps) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    if (!isLoading) return;

    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? "" : prev + ".");
    }, 500);

    return () => clearInterval(interval);
  }, [isLoading]);

  if (!isLoading) return null;

  if (variant === "minimal") {
    return (
      <div className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm",
        className
      )}>
        <div className="flex items-center space-x-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm font-medium text-muted-foreground">{message}{dots}</span>
        </div>
      </div>
    );
  }

  if (variant === "splash") {
    return (
      <div className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center bg-background",
        className
      )}>
        <div className="flex flex-col items-center space-y-6 max-w-md mx-auto px-4">
          {/* App Logo/Brand */}
          <div className="relative">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
              <div className="h-8 w-8 rounded-lg bg-primary animate-pulse" />
            </div>
            <div className="absolute -inset-1 rounded-2xl border border-primary/20 animate-pulse" />
          </div>

          {/* App Name */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Rocal
            </h1>
            <p className="text-sm text-muted-foreground">Calendar Application</p>
          </div>

          {/* Loading Spinner */}
          <div className="flex flex-col items-center space-y-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            <span className="text-sm font-medium text-muted-foreground">{message}{dots}</span>
          </div>

          {/* Loading Steps */}
          <div className="w-full max-w-sm space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Initializing</span>
              <span>•••</span>
            </div>
            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary/60 to-primary animate-pulse rounded-full w-3/4" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Detailed variant (default)
  return (
    <div className={cn(
      "fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm",
      className
    )}>
      <div className="flex flex-col items-center space-y-6 max-w-md mx-auto px-4">
        {/* Main Spinner */}
        <div className="relative">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
          <div className="absolute inset-2 h-8 w-8 animate-pulse rounded-full bg-primary/20" />
        </div>

        {/* Loading Message */}
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">{message}{dots}</p>
          <p className="text-sm text-muted-foreground">Please wait while we prepare your calendar</p>
        </div>

        {/* Loading Components Skeleton */}
        <div className="w-full max-w-sm space-y-3 animate-fade-in">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" variant="shimmer" />
              <Skeleton className="h-4 w-12" variant="shimmer" />
            </div>
            <Skeleton className="h-2 w-full" variant="wave" />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" variant="shimmer" />
              <Skeleton className="h-4 w-16" variant="shimmer" />
            </div>
            <Skeleton className="h-2 w-4/5" variant="wave" />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-16" variant="shimmer" />
              <Skeleton className="h-4 w-10" variant="shimmer" />
            </div>
            <Skeleton className="h-2 w-3/5" variant="wave" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Loading screen for specific sections
interface SectionLoadingProps {
  title?: string;
  description?: string;
  className?: string;
}

export function SectionLoading({ 
  title = "Loading", 
  description = "Please wait...",
  className 
}: SectionLoadingProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center p-8 text-center space-y-4",
      className
    )}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// Loading overlay for interactive elements
interface LoadingOverlayProps {
  isLoading?: boolean;
  children: React.ReactNode;
  message?: string;
  className?: string;
}

export function LoadingOverlay({ 
  isLoading = false, 
  children, 
  message = "Loading...",
  className 
}: LoadingOverlayProps) {
  return (
    <div className={cn("relative", className)}>
      {children}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
          <div className="flex items-center space-x-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm font-medium">{message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export type { GlobalLoadingScreenProps, SectionLoadingProps, LoadingOverlayProps };