"use client";

import React, { useRef, useState } from "react";
import { BlobatarAvatar } from "@workspace/ui/components/ui/blobatar-avatar";
import { gsap, useGSAP } from "@workspace/ui/lib/gsap";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";

import type { SectionMessage } from "./account-settings-types";

export function AnimatedCollapse({
  isOpen,
  children,
}: {
  isOpen: boolean;
  children: React.ReactNode;
}) {
  const [shouldRender, setShouldRender] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useGSAP(
    () => {
      if (isOpen && !shouldRender) {
        setShouldRender(true);
        return;
      }

      const el = containerRef.current;
      if (!el) return;

      tweenRef.current?.kill();

      if (prefersReducedMotion) {
        if (isOpen) {
          gsap.set(el, { autoAlpha: 1, height: "auto", overflow: "visible" });
        } else {
          gsap.set(el, { autoAlpha: 0, height: 0, overflow: "hidden" });
          setShouldRender(false);
        }
        return;
      }

      if (isOpen) {
        const targetHeight = el.scrollHeight;
        tweenRef.current = gsap.fromTo(
          el,
          { height: 0, autoAlpha: 0, y: -8, overflow: "hidden" },
          {
            height: targetHeight,
            autoAlpha: 1,
            y: 0,
            duration: 0.22,
            ease: "power2.out",
            overwrite: true,
            onComplete: () =>
              gsap.set(el, {
                height: "auto",
                overflow: "visible",
                clearProps: "y",
              }),
          },
        );
      } else {
        tweenRef.current = gsap.to(el, {
          height: 0,
          autoAlpha: 0,
          y: -6,
          overflow: "hidden",
          duration: 0.16,
          ease: "power2.in",
          overwrite: true,
          onComplete: () => setShouldRender(false),
        });
      }
    },
    { dependencies: [isOpen, shouldRender] },
  );

  if (!isOpen && !shouldRender) return null;

  return (
    <div
      ref={containerRef}
      style={{ height: 0, overflow: "hidden", opacity: 0 }}
    >
      {children}
    </div>
  );
}

export function AccountAvatar({
  name,
  email,
  imageUrl,
  size = "md",
}: {
  name?: string | null;
  email?: string | null;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "lg" ? "size-14" : size === "sm" ? "size-8" : "size-10";

  return (
    <BlobatarAvatar
      email={email}
      name={name}
      src={imageUrl}
      className={sizeClass}
      title={name || email || undefined}
      animate="hover"
    />
  );
}

export function FieldInput({
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  placeholder,
  disabled,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        disabled={disabled}
        className="flex h-9 w-full rounded-md bg-input px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
}

export function InlineMessage({ msg }: { msg: SectionMessage }) {
  if (!msg) return null;
  return (
    <div
      className={`rounded-md px-3 py-2 text-xs ${
        msg.kind === "success"
          ? "bg-secondary/10 text-secondary-foreground"
          : "bg-destructive/10 text-destructive"
      }`}
      role={msg.kind === "error" ? "alert" : "status"}
    >
      {msg.text}
    </div>
  );
}
