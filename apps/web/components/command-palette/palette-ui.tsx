import type {
  ButtonHTMLAttributes,
  ComponentType,
  CSSProperties,
  ReactNode,
} from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { cn } from "@workspace/ui/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";

import { PALETTE_INPUT_CLASS, PALETTE_ROW_CLASS, PALETTE_VIEW_STYLE } from "./palette-styles";

export function PaletteViewHeader({
  title,
  onBack,
  actions,
}: {
  title: ReactNode;
  onBack: () => void;
  actions?: ReactNode;
}) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-1.5 border-b border-border px-2.5">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/25 sm:size-8"
      >
        <ChevronLeft className="size-4" strokeWidth={2} />
      </button>
      <span className="min-w-0 flex-1 truncate text-[15px] font-[470] text-foreground">
        {title}
      </span>
      {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
    </div>
  );
}

/** Header plus a scrollable body with the palette's standard padding. */
export function PaletteView({
  title,
  onBack,
  actions,
  children,
}: {
  title: ReactNode;
  onBack: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col" style={PALETTE_VIEW_STYLE}>
      <PaletteViewHeader title={title} onBack={onBack} actions={actions} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {children}
      </div>
    </div>
  );
}

export function PaletteSection({
  label,
  children,
}: {
  label?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={typeof label === "string" ? label : undefined} className="flex flex-col gap-px pb-2 last:pb-0">
      {label ? <PaletteSectionLabel>{label}</PaletteSectionLabel> : null}
      {children}
    </section>
  );
}

export function PaletteSectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "px-2 pt-2 pb-1 text-[13px] font-[470] text-muted-foreground/80",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PaletteIconBox({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
      {children}
    </span>
  );
}

export function PaletteNavRow({
  icon: Icon,
  iconColor,
  leading,
  label,
  description,
  trailing,
  onClick,
  disabled,
  muted = false,
  index,
  isSelected = false,
}: {
  icon?: ComponentType<{ className?: string; style?: CSSProperties }>;
  iconColor?: string;
  leading?: ReactNode;
  label: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  muted?: boolean;
  index?: number;
  isSelected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-index={index}
      aria-current={isSelected ? "true" : undefined}
      className={cn(PALETTE_ROW_CLASS, "group", isSelected && "bg-muted")}
    >
      {Icon ? (
        <PaletteIconBox>
          <Icon className="size-4" style={iconColor ? { color: iconColor } : undefined} />
        </PaletteIconBox>
      ) : leading ? (
        <PaletteIconBox>{leading}</PaletteIconBox>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate text-[15px] leading-[130%]",
            muted ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {label}
        </span>
        {description ? (
          <span className="truncate text-[13px] leading-[130%] text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      {trailing === undefined ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
      ) : (
        trailing
      )}
    </button>
  );
}

export function PaletteField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <label htmlFor={htmlFor} className="text-[13px] font-[470] text-muted-foreground/80">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[13px] leading-[130%] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export type PaletteSelectOption<T extends string> = { value: T; label: string };

export function PaletteSelect<T extends string>({
  id,
  label,
  value,
  options,
  onValueChange,
  disabled,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly PaletteSelectOption<T>[];
  onValueChange: (value: T) => void;
  disabled?: boolean;
}) {
  const selectedOption = options.find((option) => option.value === value);
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(nextValue) => {
        const option = options.find((entry) => entry.value === nextValue);
        if (option) onValueChange(option.value);
      }}
    >
      <SelectTrigger
        id={id}
        aria-label={label}
        className={cn(PALETTE_INPUT_CLASS, "cursor-pointer")}
      >
        <SelectValue>{selectedOption?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent
        sideOffset={4}
        collisionPadding={8}
        className="rounded-xl border-[var(--border-secondary)] bg-[var(--bg-l3-solid)] font-sans text-[var(--text-primary)] shadow-[var(--shadow-l2)]"
      >
        <SelectGroup>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="min-h-11 rounded-lg text-[15px] focus:bg-[var(--bg-cell-hover)] hover:bg-[var(--bg-cell-hover)] sm:min-h-8 [&_svg]:text-primary"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

const BUTTON_VARIANT = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary: "bg-muted text-foreground hover:bg-muted/70",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  destructive: "bg-destructive/10 text-destructive hover:bg-destructive/15",
} as const;

export function PaletteButton({
  variant = "secondary",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANT;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-[470] outline-none transition-[background-color,opacity,color] focus-visible:ring-2 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-40 sm:min-h-8 sm:min-w-8",
        BUTTON_VARIANT[variant],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function PaletteFormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2 px-2 pt-2 pb-1">{children}</div>;
}

export function PaletteEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-2 py-6 text-center text-[13px] leading-[130%] text-muted-foreground">{children}</div>
  );
}
