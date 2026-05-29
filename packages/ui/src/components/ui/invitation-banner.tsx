"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";

import { cn } from "@workspace/ui/lib/utils";

type InvitationBannerVariant = "invitation" | "invitationCancelled";

type InvitationBannerContextValue = {
  variant: InvitationBannerVariant;
  inactive: boolean;
};

const InvitationBannerContext =
  React.createContext<InvitationBannerContextValue | null>(null);

function useInvitationBannerContext(component: string) {
  const context = React.useContext(InvitationBannerContext);
  if (!context) {
    throw new Error(`${component} must be used within an <InvitationBanner>.`);
  }
  return context;
}

const invitationBannerVariants = cva(
  "mx-4 mb-2 space-y-2 rounded-lg border border-border/50 bg-card px-4 py-3 transition-colors",
  {
    variants: {
      inactive: {
        true: "bg-muted/20 opacity-60",
        false: "",
      },
    },
    defaultVariants: { inactive: false },
  },
);

function InvitationBanner({
  className,
  variant = "invitation",
  inactive = false,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof invitationBannerVariants> & {
    variant?: InvitationBannerVariant;
  }) {
  const resolvedVariant = variant ?? "invitation";
  const resolvedInactive = inactive ?? false;

  return (
    <InvitationBannerContext.Provider
      value={{ variant: resolvedVariant, inactive: resolvedInactive }}
    >
      <div
        data-slot="invitation-banner"
        data-variant={resolvedVariant}
        className={cn(
          invitationBannerVariants({ inactive: resolvedInactive }),
          className,
        )}
        {...props}
      />
    </InvitationBannerContext.Provider>
  );
}

function InvitationBannerHeader({
  className,
  label,
  title,
  description,
  badge,
  action,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  label?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { variant } = useInvitationBannerContext("InvitationBannerHeader");
  const cancelled = variant === "invitationCancelled";

  return (
    <div
      data-slot="invitation-banner-header"
      className={cn(
        "flex flex-wrap items-start justify-between gap-2",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        {(label || badge) && (
          <div className="mb-0.5 flex flex-wrap items-center gap-2">
            {label && (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </span>
            )}
            {badge}
          </div>
        )}
        <div
          className={cn(
            "text-base font-semibold leading-snug text-foreground",
            cancelled &&
              "text-muted-foreground line-through decoration-muted-foreground/40",
          )}
        >
          {title}
        </div>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function InvitationBannerMeta({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="invitation-banner-meta"
      className={cn("space-y-1.5 text-sm text-foreground/80", className)}
      {...props}
    />
  );
}

function InvitationBannerMetaItem({
  className,
  icon: Icon,
  children,
  ...props
}: React.ComponentProps<"div"> & { icon?: LucideIcon }) {
  const { variant } = useInvitationBannerContext("InvitationBannerMetaItem");
  const cancelled = variant === "invitationCancelled";

  return (
    <div
      data-slot="invitation-banner-meta-item"
      className={cn("flex items-center gap-2", className)}
      {...props}
    >
      {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
      <span className={cn("min-w-0 truncate", cancelled && "line-through")}>
        {children}
      </span>
    </div>
  );
}

function InvitationBannerActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="invitation-banner-actions"
      className={cn(
        "flex flex-wrap items-center gap-2 border-t border-border/40 pt-2.5",
        className,
      )}
      {...props}
    />
  );
}

export {
  InvitationBanner,
  InvitationBannerHeader,
  InvitationBannerMeta,
  InvitationBannerMetaItem,
  InvitationBannerActions,
  invitationBannerVariants,
  type InvitationBannerVariant,
};
