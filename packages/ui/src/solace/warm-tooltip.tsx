"use client";

import React, {
  cloneElement,
  createContext,
  use,
  useEffectEvent,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from 'react-dom';
import {
  AnimatePresence,
  LazyMotion,
  animate,
  domAnimation,
  m,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
  type MotionStyle,
  type Variants
} from 'motion/react';

import "./warm-tooltip.css";

export type WarmTooltipSide = 'top' | 'bottom' | 'left' | 'right';
export type WarmTooltipSize = 'sm' | 'md' | 'lg';

export interface WarmTooltipGroupProps {
  delay?: number;
  warmWindow?: number;
  travel?: number;
  lean?: number;
  onWarmChange?: (warm: boolean) => void;
  children?: ReactNode;
  ref?: Ref<WarmTooltipGroupHandle>;
}

export interface WarmTooltipGroupHandle {
  reset: () => void;
}

export interface WarmTooltipProps {
  content: ReactNode;
  shortcut?: ReactNode;
  children: ReactElement<Record<string, unknown>>;
  side?: WarmTooltipSide;
  delay?: number;
  warmWindow?: number;
  surfaceColor?: string;
  inkColor?: string;
  size?: WarmTooltipSize;
  radius?: number;
  gap?: number;
  arrow?: boolean;
  popDuration?: number;
  popScale?: number;
  popBlur?: number;
  showFuse?: boolean;
  longPress?: number;
  disabled?: boolean;
  className?: string;
}

type Phase = 'closed' | 'open' | 'closing';
type Mode = 'cold' | 'warm' | 'instant';
type Timer = ReturnType<typeof setTimeout> | undefined;
type Swap = { dir: number; across: boolean };

interface Payload {
  id: string;
  trigger: HTMLElement;
  content: ReactNode;
  shortcut?: ReactNode;
  side: WarmTooltipSide;
  gap: number;
  arrow: boolean;
  surfaceColor: string;
  inkColor: string;
  radius: number;
  font: number;
  px: number;
  py: number;
  popDuration: number;
  popScale: number;
  popBlur: number;
  warmWindow: number;
}

interface GroupState {
  state: Phase;
  current: Payload | null;
  mode: Mode | 'move';
  instant: boolean;
  warmUntil: number;
  warm: boolean;
  swap: Swap;
  closeTimer: Timer;
  leaveTimer: Timer;
  warmTimer: Timer;
}

interface GroupApi {
  id: string;
  delay: number;
  warmWindow: number;
  activeId: string | null;
  isWarm: () => boolean;
  show: (payload: Payload, mode: Mode) => void;
  hide: (tooltipId: string, instant?: boolean) => void;
  reset: () => void;
}

interface TriggerState {
  open: Timer;
  press: Timer;
  press0: { x: number; y: number; id: number } | null;
  suppressClick: boolean;
}

type TriggerProps = Required<Omit<WarmTooltipProps, 'delay' | 'warmWindow' | 'shortcut'>> &
  Pick<WarmTooltipProps, 'delay' | 'warmWindow' | 'shortcut'>;

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const LEAN_SPRING = { stiffness: 260, damping: 22, mass: 0.4 };
const FULL_LEAN_SPEED = 1200;
const SIGN: Record<WarmTooltipSide, number> = { top: 1, bottom: -1, left: -1, right: 1 };
const ORIGIN: Record<WarmTooltipSide, string> = {
  top: 'center bottom',
  bottom: 'center top',
  left: 'right center',
  right: 'left center'
};
const SIZES: Record<WarmTooltipSize, { font: number; px: number; py: number }> = {
  sm: { font: 11.5, px: 8, py: 5 },
  md: { font: 12, px: 12, py: 6 },
  lg: { font: 13.5, px: 12, py: 7 }
};
const MARGIN = 8;
const HOLD_SLOP = 10;
const SWAP = 0.14;
const SWAP_SHIFT = 10;
const RISE = 4;
const GRACE = 80;

const FLIP_ROOM = 40;

/** Flip to the opposite edge when the preferred side would render off-screen. */
const fitSide = (side: WarmTooltipSide, trigger: HTMLElement | null): WarmTooltipSide => {
  if (!trigger || typeof window === 'undefined') return side;
  const rect = trigger.getBoundingClientRect();
  if (side === 'top' && rect.top < FLIP_ROOM) return 'bottom';
  if (side === 'bottom' && window.innerHeight - rect.bottom < FLIP_ROOM) return 'top';
  if (side === 'left' && rect.left < FLIP_ROOM * 3) return 'right';
  if (side === 'right' && window.innerWidth - rect.right < FLIP_ROOM * 3) return 'left';
  return side;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const num = (value: unknown) => (typeof value === "number" ? value : 0);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const horizontal = (side: WarmTooltipSide) => side === 'top' || side === 'bottom';

const anchorOf = (rect: DOMRect, side: WarmTooltipSide, gap: number): [number, number] => {
  if (side === 'top') return [rect.left + rect.width / 2, rect.top - gap];
  if (side === 'bottom') return [rect.left + rect.width / 2, rect.bottom + gap];
  if (side === 'left') return [rect.left - gap, rect.top + rect.height / 2];
  return [rect.right + gap, rect.top + rect.height / 2];
};

const layoutOf = (x: number, y: number, width: number, height: number, side: WarmTooltipSide) => {
  if (horizontal(side)) {
    const X = clamp(x - width / 2, MARGIN, Math.max(MARGIN, window.innerWidth - MARGIN - width));
    return { X, Y: side === 'top' ? y - height : y };
  }
  const Y = clamp(y - height / 2, MARGIN, Math.max(MARGIN, window.innerHeight - MARGIN - height));
  return { X: side === 'left' ? x - width : x, Y };
};

const LAYER: Variants = {
  enter: ({ dir, across }: Swap) => ({
    opacity: dir === 0 ? 1 : 0,
    x: across ? 0 : SWAP_SHIFT * dir,
    y: across ? SWAP_SHIFT * dir : 0,
    filter: dir === 0 ? 'blur(0px)' : 'blur(3px)'
  }),
  show: { opacity: 1, x: 0, y: 0, filter: 'blur(0px)' },
  exit: ({ dir, across }: Swap) => ({
    opacity: 0,
    x: across ? 0 : -SWAP_SHIFT * dir,
    y: across ? -SWAP_SHIFT * dir : 0,
    filter: 'blur(3px)'
  })
};

const GroupContext = createContext<GroupApi | null>(null);

export function WarmTooltipGroup({
  delay = 1500,
  warmWindow = 300,
  travel = 320,
  lean = 0,
  onWarmChange,
  children,
  ref,
}: WarmTooltipGroupProps) {
  const reduce = useReducedMotion();
  const id = useId();
  const [current, setCurrent] = useState<Payload | null>(null);
  const [state, setState] = useState<Phase>('closed');
  const st = useRef<GroupState>({
    state: 'closed',
    current: null,
    mode: 'cold',
    instant: false,
    warmUntil: -Infinity,
    warm: false,
    swap: { dir: 0, across: false },
    closeTimer: undefined,
    leaveTimer: undefined,
    warmTimer: undefined
  });
  const textRef = useRef<HTMLSpanElement | null>(null);
  const api = useRef<{
    show: (payload: Payload, mode: Mode) => void;
    hide: (tooltipId: string, instant?: boolean) => void;
  }>({
    show: () => {},
    hide: () => {}
  });

  const ax = useMotionValue(0);
  const ay = useMotionValue(0);
  const w = useMotionValue(0);
  const h = useMotionValue(0);
  const presence = useMotionValue(0);
  const vx = useVelocity(ax);
  const vy = useVelocity(ay);
  const speed = useTransform([vx, vy], ([a, b]) => {
    const along = st.current.current && !horizontal(st.current.current.side) ? b : a;
    return num(along);
  });
  const leanUnit = useSpring(
    useTransform(speed, [-FULL_LEAN_SPEED, 0, FULL_LEAN_SPEED], [1, 0, -1], { clamp: true }),
    LEAN_SPRING
  );
  const leanDeg = reduce ? 0 : lean;

  const place = useTransform([ax, ay, w, h], ([x, y, width, height]) => {
    const side = st.current.current ? st.current.current.side : 'top';
    const { X, Y } = layoutOf(num(x), num(y), num(width), num(height), side);
    return `translate(${X}px, ${Y}px)`;
  });
  const arrowAt = useTransform([ax, ay, w, h], ([x, y, width, height]) => {
    const side = st.current.current ? st.current.current.side : 'top';
    const { X, Y } = layoutOf(num(x), num(y), num(width), num(height), side);
    return horizontal(side)
      ? clamp(num(x) - X, 10, num(width) - 10)
      : clamp(num(y) - Y, 10, num(height) - 10);
  });
  const pop = useTransform([presence, leanUnit], ([p, l]) => {
    const shown = num(p);
    const tilt = num(l);
    const c = st.current.current;
    const side = c ? c.side : 'top';
    if (reduce || !c) return 'none';
    const scale = c.popScale + (1 - c.popScale) * shown;
    const rise = (1 - shown) * RISE * SIGN[side] * (side === 'left' ? -1 : 1);
    const rotate = tilt * leanDeg * SIGN[side];
    const tx = horizontal(side) ? 0 : rise;
    const ty = horizontal(side) ? rise : 0;
    return `translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rotate}deg)`;
  });
  const blur = useTransform(presence, (p) => {
    const c = st.current.current;
    return reduce || !c ? 'none' : `blur(${c.popBlur * (1 - num(p))}px)`;
  });

  const isWarm = () => st.current.state !== 'closed' || now() < st.current.warmUntil;
  const notify = useCallback(() => {
    const next = st.current.state !== 'closed' || now() < st.current.warmUntil;
    if (next === st.current.warm) return;
    st.current.warm = next;
    onWarmChange?.(next);
  }, [onWarmChange]);

  const finishClose = () => {
    st.current.state = 'closed';
    st.current.current = null;
    setState('closed');
    setCurrent(null);
    notify();
  };

  api.current.show = (payload: Payload, mode: Mode) => {
    clearTimeout(st.current.closeTimer);
    clearTimeout(st.current.leaveTimer);
    const prev = st.current.current;
    const fresh = st.current.state === 'closed';
    if (prev && prev.id !== payload.id) {
      const [px, py] = anchorOf(prev.trigger.getBoundingClientRect(), prev.side, prev.gap);
      const [nx, ny] = anchorOf(payload.trigger.getBoundingClientRect(), payload.side, payload.gap);
      const across = !horizontal(payload.side);
      st.current.swap = { dir: Math.sign(across ? ny - py : nx - px) || 1, across };
    } else {
      st.current.swap = { dir: 0, across: !horizontal(payload.side) };
    }
    st.current.mode = fresh ? mode : mode === 'instant' ? 'instant' : 'move';
    st.current.instant = mode === 'instant';
    st.current.current = payload;
    st.current.state = 'open';
    setCurrent(payload);
    setState('open');
    notify();
  };

  const beginClose = (instant: boolean) => {
    const c = st.current.current;
    if (!c || st.current.state !== 'open') return;
    st.current.state = 'closing';
    setState('closing');
    st.current.warmUntil = now() + c.warmWindow;
    clearTimeout(st.current.warmTimer);
    st.current.warmTimer = setTimeout(notify, c.warmWindow + 1);
    if (instant) {
      presence.jump(0);
      finishClose();
      return;
    }
    const closeMs = Math.round(c.popDuration * 0.8);
    animate(presence, 0, { duration: closeMs / 1000, ease: EASE_OUT });
    st.current.closeTimer = setTimeout(finishClose, closeMs);
  };

  api.current.hide = (tooltipId: string, instant?: boolean) => {
    const c = st.current.current;
    if (!c || c.id !== tooltipId || st.current.state !== 'open') return;
    clearTimeout(st.current.leaveTimer);
    if (instant || st.current.instant) {
      beginClose(true);
      return;
    }
    st.current.leaveTimer = setTimeout(() => beginClose(false), GRACE);
  };

  const group = useMemo(
    () => ({
      id,
      delay,
      warmWindow,
      activeId: current ? current.id : null,
      isWarm,
      show: (payload: Payload, mode: Mode) => api.current.show(payload, mode),
      hide: (tooltipId: string, instant?: boolean) => api.current.hide(tooltipId, instant),
      reset: () => {
        if (st.current.current) api.current.hide(st.current.current.id, true);
        st.current.warmUntil = -Infinity;
        clearTimeout(st.current.warmTimer);
        notify();
      }
    }),
    [id, delay, warmWindow, current, notify]
  );
  useImperativeHandle(ref, () => ({ reset: group.reset }), [group]);

  useLayoutEffect(() => {
    const c = st.current.current;
    const text = textRef.current;
    if (!c || !text || state !== 'open') return;
    const [tx, ty] = anchorOf(c.trigger.getBoundingClientRect(), c.side, c.gap);
    const tw = text.offsetWidth + c.px * 2;
    const th = text.offsetHeight + c.py * 2;
    const mode = st.current.mode;
    if (mode === 'move' && !reduce && travel > 0) {
      const spring = { type: 'spring' as const, duration: travel / 1000, bounce: 0.1 };
      animate(ax, tx, spring);
      animate(ay, ty, spring);
      animate(w, tw, spring);
      animate(h, th, spring);
      animate(presence, 1, { duration: 0.12, ease: EASE_OUT });
      return;
    }
    ax.jump(tx);
    ay.jump(ty);
    w.jump(tw);
    h.jump(th);
    if (mode === 'cold') {
      presence.jump(0);
      animate(presence, 1, { duration: c.popDuration / 1000, ease: EASE_OUT });
    } else {
      presence.jump(1);
    }
  }, [current, state, reduce, travel, ax, ay, w, h, presence, ax.jump, ay.jump, w.jump, h.jump, presence.jump]);

  useEffect(() => {
    if (state === 'closed') return undefined;
    let raf = 0;
    const follow = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const c = st.current.current;
        if (!c) return;
        const [tx, ty] = anchorOf(c.trigger.getBoundingClientRect(), c.side, c.gap);
        ax.jump(tx);
        ay.jump(ty);
      });
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && st.current.current) api.current.hide(st.current.current.id, true);
    };
    window.addEventListener('scroll', follow, { capture: true, passive: true });
    window.addEventListener('resize', follow);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', follow, { capture: true });
      window.removeEventListener('resize', follow);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [state, ax, ay, ax.jump, ay.jump]);

  useEffect(
    () => () => {
      clearTimeout(st.current.closeTimer);
      clearTimeout(st.current.leaveTimer);
      clearTimeout(st.current.warmTimer);
    },
    []
  );

  const canPortal = typeof document !== 'undefined';
  const side = current ? current.side : 'top';
  const arrowStyle = horizontal(side) ? { left: arrowAt } : { top: arrowAt };

  return (
    <LazyMotion features={domAnimation}>
    <GroupContext.Provider value={group}>
      {children}
      {state !== 'closed' && current && canPortal
        ? createPortal(
            <m.span
              id={id}
              role="tooltip"
              className="warm-tooltip"
              data-side={side}
              style={
                {
                  transform: place,
                  width: w,
                  height: h,
                  '--wt-surface': current.surfaceColor,
                  '--wt-ink': current.inkColor,
                  '--wt-radius': `${current.radius}px`,
                  '--wt-font': `${current.font}px`,
                  '--wt-origin': ORIGIN[side]
                } as MotionStyle
              }
            >
              <m.span className="warm-tooltip__box" style={{ transform: pop, opacity: presence, filter: blur }}>
                <AnimatePresence initial={false} custom={st.current.swap}>
                  <m.span
                    key={current.id}
                    className="warm-tooltip__layer"
                    custom={st.current.swap}
                    variants={LAYER}
                    initial="enter"
                    animate="show"
                    exit="exit"
                    transition={{ duration: reduce ? 0 : SWAP, ease: EASE_OUT }}
                  >
                    <span
                      ref={el => {
                        if (el) textRef.current = el;
                      }}
                      className="warm-tooltip__text"
                    >
                      {current.content}
                      {current.shortcut ? <kbd className="warm-tooltip__kbd">{current.shortcut}</kbd> : null}
                    </span>
                  </m.span>
                </AnimatePresence>
                {current.arrow ? (
                  <m.span className="warm-tooltip__arrow" data-side={side} style={arrowStyle} aria-hidden="true" />
                ) : null}
              </m.span>
            </m.span>,
            document.body
          )
        : null}
    </GroupContext.Provider>
    </LazyMotion>
  );
}

const Trigger: React.FC<TriggerProps> = ({
  content,
  shortcut,
  children,
  side,
  delay,
  warmWindow,
  surfaceColor,
  inkColor,
  size,
  radius,
  gap,
  arrow,
  popDuration,
  popScale,
  popBlur,
  showFuse,
  longPress,
  disabled,
  className
}) => {
  const group = use(GroupContext);
  if (!group) {
    throw new Error("Warm tooltip trigger rendered outside its group");
  }
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [fuse, setFuse] = useState<'idle' | 'arming'>('idle');
  const [pressing, setPressing] = useState(false);
  const t = useRef<TriggerState>({ open: undefined, press: undefined, press0: null, suppressClick: false });
  const preset = SIZES[size] || SIZES.md;
  const coldDelay = delay ?? group.delay;
  const active = group.activeId === id;

  const payload = (): Payload => ({
    id,
    trigger: triggerRef.current as HTMLSpanElement,
    content,
    shortcut,
    side: fitSide(side, triggerRef.current),
    gap,
    arrow,
    surfaceColor,
    inkColor,
    radius,
    font: preset.font,
    px: preset.px,
    py: preset.py,
    popDuration,
    popScale,
    popBlur,
    warmWindow: warmWindow ?? group.warmWindow
  });

  const hide = (instant?: boolean) => {
    clearTimeout(t.current.open);
    setFuse('idle');
    group.hide(id, instant);
  };
  const hideFromOutside = useEffectEvent(() => {
    hide(false);
  });
  const arm = () => {
    if (group.isWarm()) {
      group.show(payload(), 'warm');
      return;
    }
    setFuse('arming');
    t.current.open = setTimeout(() => {
      setFuse('idle');
      group.show(payload(), 'cold');
    }, coldDelay);
  };

  const cancelPress = () => {
    clearTimeout(t.current.press);
    if (!t.current.press0) return;
    t.current.press0 = null;
    setPressing(false);
    setFuse('idle');
  };

  const cancelAll = useEffectEvent(() => {
    clearTimeout(t.current.press);
    t.current.press0 = null;
    setPressing(false);
    hide(true);
  });
  useEffect(() => {
    if (disabled) return undefined;
    return () => cancelAll();
  }, [disabled]);

  useEffect(() => {
    if (!active) return undefined;
    const onOutside = (e: PointerEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) hideFromOutside();
    };
    document.addEventListener('pointerdown', onOutside, true);
    return () => document.removeEventListener('pointerdown', onOutside, true);
  }, [active]);

  const handlers = disabled
    ? {}
    : {
        onPointerEnter: (e: React.PointerEvent<HTMLSpanElement>) => {
          if (e.pointerType !== 'touch' && e.buttons === 0) arm();
        },
        onPointerLeave: (e: React.PointerEvent<HTMLSpanElement>) => {
          if (e.pointerType !== 'touch') hide(false);
        },
        onPointerDown: (e: React.PointerEvent<HTMLSpanElement>) => {
          if (e.pointerType === 'mouse') {
            hide(false);
            return;
          }
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Capture fails when the pointer has already ended.
          }
          t.current.press0 = { x: e.clientX, y: e.clientY, id: e.pointerId };
          setPressing(true);
          setFuse('arming');
          t.current.press = setTimeout(() => {
            t.current.suppressClick = true;
            t.current.press0 = null;
            setPressing(false);
            setFuse('idle');
            group.show(payload(), 'cold');
          }, longPress);
        },
        onPointerMove: (e: React.PointerEvent<HTMLSpanElement>) => {
          const p = t.current.press0;
          if (p && p.id === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > HOLD_SLOP) cancelPress();
        },
        onPointerUp: cancelPress,
        onPointerCancel: cancelPress,
        onContextMenu: (e: React.MouseEvent<HTMLSpanElement>) => {
          if (t.current.press0) e.preventDefault();
        },
        onClickCapture: (e: React.MouseEvent<HTMLSpanElement>) => {
          if (!t.current.suppressClick) return;
          t.current.suppressClick = false;
          e.preventDefault();
          e.stopPropagation();
        },
        onFocus: (e: React.FocusEvent<HTMLSpanElement>) => {
          if ((e.target as HTMLElement).matches?.(':focus-visible')) group.show(payload(), 'instant');
        },
        onBlur: () => hide(true),
        onKeyDown: (e: React.KeyboardEvent<HTMLSpanElement>) => {
          if (e.key === 'Escape') hide(true);
        }
      };

  const described = children.props['aria-describedby'] as string | undefined;

  return (
    <span
      ref={triggerRef}
      className={`warm-tooltip__trigger${className ? ` ${className}` : ''}`}
      data-pressing={pressing ? '' : undefined}
      style={
        {
          '--wt-surface': surfaceColor,
          '--wt-fuse-ms': `${t.current.press0 ? longPress : coldDelay}ms`
        } as CSSProperties
      }
      {...handlers}
    >
      {cloneElement(children, { 'aria-describedby': active ? group.id : described })}
      {showFuse ? <span className="warm-tooltip__fuse" data-side={side} data-fuse={fuse} aria-hidden="true" /> : null}
    </span>
  );
};

const WarmTooltip: React.FC<WarmTooltipProps> = ({
  content,
  shortcut,
  children,
  side = 'top',
  delay,
  warmWindow,
  surfaceColor = "var(--primary)",
  inkColor = "var(--primary-foreground)",
  size = 'md',
  radius = 6,
  gap = 8,
  arrow = true,
  popDuration = 160,
  popScale = 0.94,
  popBlur = 4,
  showFuse = false,
  longPress = 500,
  disabled = false,
  className = ''
}) => {
  const context = use(GroupContext);
  const props = {
    content,
    shortcut,
    children,
    side,
    delay,
    warmWindow,
    surfaceColor,
    inkColor,
    size,
    radius,
    gap,
    arrow,
    popDuration,
    popScale,
    popBlur,
    showFuse,
    longPress,
    disabled,
    className
  };
  if (context) return <Trigger {...props} />;
  return (
    <WarmTooltipGroup delay={delay} warmWindow={warmWindow}>
      <Trigger {...props} />
    </WarmTooltipGroup>
  );
};

export { WarmTooltip };
