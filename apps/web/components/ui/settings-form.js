"use client";
import React from "react";
import { Button } from "@workspace/ui/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
export function SettingsFormHeader({ title, description, onBack, loading = false, actions, className, }) {
    return (<div className={cn("bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3", className)}>
      {onBack && (<button onClick={onBack} disabled={loading} className="p-1.5 rounded-md hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          <ArrowLeft className="h-4 w-4 text-muted-foreground"/>
        </button>)}
      <div className="flex-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description && (<p className="text-sm text-muted-foreground">{description}</p>)}
      </div>
      {loading && (<Loader2 className="h-4 w-4 animate-spin text-muted-foreground"/>)}
      {actions}
    </div>);
}
export function SettingsFormContent({ children, className, }) {
    return (<div className={cn("p-6 space-y-6 max-h-[70vh] overflow-y-auto", className)}>
      {children}
    </div>);
}
export function SettingsFormFooter({ children, primaryAction, secondaryAction, className, }) {
    return (<div className={cn("border-t border-border bg-gradient-to-r from-background/80 to-muted/20 px-6 py-4 flex items-center justify-between backdrop-blur-sm", className)}>
      <div className="flex items-center gap-3">
        {secondaryAction && (<Button variant={secondaryAction.variant || "outline"} onClick={secondaryAction.onClick} disabled={secondaryAction.disabled}>
            {secondaryAction.label}
          </Button>)}
      </div>
      <div className="flex items-center gap-3">
        {children}
        {primaryAction && (<Button variant={primaryAction.variant || "default"} onClick={primaryAction.onClick} disabled={primaryAction.disabled || primaryAction.loading}>
            {primaryAction.loading && (<Loader2 className="h-4 w-4 animate-spin mr-2"/>)}
            {primaryAction.label}
          </Button>)}
      </div>
    </div>);
}
export function SettingsForm({ children, className }) {
    return (<div className={cn("bg-background border border-border rounded-lg shadow-sm overflow-hidden", className)}>
      {children}
    </div>);
}
// Compound component pattern
SettingsForm.Header = SettingsFormHeader;
SettingsForm.Content = SettingsFormContent;
SettingsForm.Footer = SettingsFormFooter;
