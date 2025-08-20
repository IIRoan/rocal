"use client";

import { cn } from "../../lib/utils";
import { useEffect, useState } from "react";
import { default as Logo } from "../layout/logo";
import { useCyclingMessage } from "../../hooks/use-cycling-message";
import type { COMBINED_MESSAGES } from "../../constants/loading-messages";

interface LogoSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showText?: boolean;
  text?: string;
  messageContext?: keyof typeof COMBINED_MESSAGES;
  enableCycling?: boolean;
}

export function LogoSpinner({ 
  size = "md", 
  className,
  showText = true,
  text,
  messageContext = "PAGE_LOAD",
  enableCycling = true
}: LogoSpinnerProps) {
  // Use cycling messages if no static text provided
  const { message, isTransitioning } = useCyclingMessage({
    context: messageContext,
    enabled: enableCycling && !text && showText
  });
  
  // Use static text if provided, otherwise use cycling message
  const displayText = text || message;

  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-12 w-12", 
    lg: "h-16 w-16",
    xl: "h-20 w-20"
  };

  const containerSizeClasses = {
    sm: "h-10 w-10",
    md: "h-14 w-14",
    lg: "h-18 w-18", 
    xl: "h-22 w-22"
  };

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      {/* Logo container with floating animation */}
      <div className={cn(
        "relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/20 border border-primary/20 animate-logo-float",
        containerSizeClasses[size]
      )}>
        {/* Background pulse effect */}
        <div className={cn(
          "absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/40 animate-logo-pulse",
          containerSizeClasses[size]
        )} />
        
        {/* Rotating border */}
        <div className={cn(
          "absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-primary via-primary/50 to-primary opacity-30 animate-logo-spin",
        )} />
        
        {/* Logo icon */}
        <div className={cn(
          "relative z-10 rounded-lg bg-primary/10 flex items-center justify-center p-2",
          sizeClasses[size]
        )}>
          {/* Actual logo component with rotation animation */}
          <div className="relative animate-spin" style={{ animationDuration: '4s' }}>
            <Logo 
              className={cn(
                "text-primary drop-shadow-sm",
                sizeClasses[size]
              )}
              fill="currentColor"
            />
          </div>
        </div>
      </div>

      {/* Loading text */}
      {showText && (
        <div className="flex flex-col items-center gap-2">
          <p className={cn(
            "text-sm font-medium text-foreground transition-opacity duration-300",
            isTransitioning && enableCycling && !text ? "opacity-50" : "opacity-100"
          )}>
            {displayText}
          </p>
          
          {/* Progress indicator */}
          <div className="w-24 h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary/60 to-primary animate-pulse rounded-full" 
                 style={{
                   width: '75%',
                   animation: 'pulse 1.5s ease-in-out infinite'
                 }} />
          </div>
        </div>
      )}
    </div>
  );
}

// Page loading overlay with logo spinner
interface PageLoadingOverlayProps {
  isLoading?: boolean;
  message?: string;
  messageContext?: keyof typeof COMBINED_MESSAGES;
  className?: string;
  enableCycling?: boolean;
}

export function PageLoadingOverlay({ 
  isLoading = true,
  message,
  messageContext = "PAGE_LOAD",
  className,
  enableCycling = true
}: PageLoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div className={cn(
      "fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm",
      "animate-fade-in",
      className
    )}>
      <div className="flex flex-col items-center">
        <LogoSpinner 
          size="lg" 
          text={message}
          messageContext={messageContext}
          enableCycling={enableCycling}
        />
        
        {/* Additional branding */}
        <div className="mt-6 text-center animate-slide-in" style={{ animationDelay: '0.3s' }}>
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Rocal
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Calendar Application</p>
        </div>
      </div>
    </div>
  );
}

// Small inline loader for components
interface InlineLogoSpinnerProps {
  className?: string;
  size?: "sm" | "md";
  text?: string;
  messageContext?: keyof typeof COMBINED_MESSAGES;
  enableCycling?: boolean;
}

export function InlineLogoSpinner({ 
  className,
  size = "sm",
  text,
  messageContext = "GENERAL",
  enableCycling = false // Default to false for inline usage to avoid distraction
}: InlineLogoSpinnerProps) {
  // Use cycling messages if no static text provided
  const { message, isTransitioning } = useCyclingMessage({
    context: messageContext,
    enabled: enableCycling && !text,
    cycleInterval: 3000 // Slower cycling for inline usage
  });
  
  const displayText = text || message;
  
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6"
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative">
        <div className="animate-spin" style={{ animationDuration: '2s' }}>
          <Logo 
            className={cn(
              "text-primary",
              sizeClasses[size]
            )}
            fill="currentColor"
          />
        </div>
      </div>
      <span className={cn(
        "text-sm text-muted-foreground transition-opacity duration-300",
        isTransitioning && enableCycling && !text ? "opacity-50" : "opacity-100"
      )}>
        {displayText}
      </span>
    </div>
  );
}