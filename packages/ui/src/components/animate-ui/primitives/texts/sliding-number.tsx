"use client";

import * as React from "react";
import { getGsapDurationFromSpring, gsap } from "../../../../lib/gsap";

import {
  useIsInView,
  type UseIsInViewOptions,
} from "@workspace/ui/hooks/use-is-in-view";

type SlidingNumberTransition = {
  stiffness?: number;
  damping?: number;
  mass?: number;
  duration?: number;
  ease?: string;
};

type SlidingNumberProps = Omit<
  React.ComponentPropsWithRef<"span">,
  "children"
> & {
  number: number;
  fromNumber?: number;
  onNumberChange?: (number: number) => void;
  padStart?: boolean;
  decimalSeparator?: string;
  decimalPlaces?: number;
  thousandSeparator?: string;
  transition?: SlidingNumberTransition;
  delay?: number;
  initiallyStable?: boolean;
} & UseIsInViewOptions;

function SlidingNumber({
  number,
  fromNumber,
  onNumberChange,
  inView = false,
  inViewMargin = "0px",
  inViewOnce = true,
  padStart = false,
  decimalSeparator = ".",
  decimalPlaces = 0,
  thousandSeparator,
  transition = { stiffness: 200, damping: 20, mass: 0.4 },
  delay = 0,
  initiallyStable = false,
  ...props
}: SlidingNumberProps) {
  const forwardedRef = props.ref as React.Ref<HTMLElement> | undefined;
  const { ref: localRef, isInView } = useIsInView(forwardedRef ?? null, {
    inView,
    inViewOnce,
    inViewMargin,
  });

  const initialNumeric = Math.abs(Number(number));
  const hasAnimated = fromNumber !== undefined || initiallyStable;
  const initialValue = initiallyStable ? initialNumeric : (fromNumber ?? 0);
  const animatedValueRef = React.useRef({ value: initialValue });

  const [effectiveNumber, setEffectiveNumber] =
    React.useState<number>(initialValue);

  React.useEffect(() => {
    const targetValue = hasAnimated
      ? number
      : initiallyStable
        ? initialNumeric
        : !isInView
          ? 0
          : initialNumeric;

    const nextProxy = animatedValueRef.current;
    const inferredDecimals = Math.max(decimalPlaces ?? 0, 0);
    const factor = Math.pow(10, inferredDecimals);

    if (!isInView && !initiallyStable && !hasAnimated) {
      setEffectiveNumber(0);
      onNumberChange?.(0);
      return;
    }

    gsap.killTweensOf(nextProxy);

    if (!hasAnimated || !isInView) {
      nextProxy.value = targetValue;
      setEffectiveNumber(targetValue);
      onNumberChange?.(targetValue);
      return;
    }

    const tween = gsap.to(nextProxy, {
      value: targetValue,
      duration: getGsapDurationFromSpring(transition),
      delay: delay / 1000,
      ease: transition.ease ?? "power3.out",
      overwrite: "auto",
      onUpdate: () => {
        const nextValue =
          inferredDecimals > 0
            ? Math.round(nextProxy.value * factor) / factor
            : Math.round(nextProxy.value);

        setEffectiveNumber(nextValue);
        onNumberChange?.(nextValue);
      },
    });

    return () => {
      tween.kill();
    };
  }, [
    decimalPlaces,
    delay,
    hasAnimated,
    initialNumeric,
    initiallyStable,
    isInView,
    number,
    onNumberChange,
    transition,
  ]);

  const minimumIntegerLength = React.useMemo(
    () => Math.floor(Math.abs(number)).toString().length,
    [number],
  );

  const formatDisplayNumber = React.useCallback(
    (value: number) => {
      const isNegative = value < 0;
      const absoluteValue = Math.abs(value);
      const formatted =
        decimalPlaces != null
          ? absoluteValue.toFixed(decimalPlaces)
          : absoluteValue.toString();
      const [rawInteger = "0", rawDecimal = ""] = formatted.split(".");
      const paddedInteger = padStart
        ? rawInteger.padStart(minimumIntegerLength, "0")
        : rawInteger;
      const separatedInteger = thousandSeparator
        ? paddedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSeparator)
        : paddedInteger;
      const decimalPortion = rawDecimal
        ? `${decimalSeparator}${rawDecimal}`
        : "";

      return `${isNegative ? "-" : ""}${separatedInteger}${decimalPortion}`;
    },
    [
      decimalPlaces,
      decimalSeparator,
      minimumIntegerLength,
      padStart,
      thousandSeparator,
    ],
  );

  return (
    <span
      ref={localRef}
      data-slot="sliding-number"
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontVariantNumeric: "tabular-nums",
      }}
      {...props}
    >
      {formatDisplayNumber(effectiveNumber)}
    </span>
  );
}

export { SlidingNumber, type SlidingNumberProps };
