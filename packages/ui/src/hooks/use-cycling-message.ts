import { useState, useEffect, useRef } from "react";
import {
  COMBINED_MESSAGES,
  getRandomMessage,
  MESSAGE_CYCLE_CONFIG,
} from "../constants/loading-messages";

interface UseCyclingMessageOptions {
  messages?: readonly string[];
  context?: keyof typeof COMBINED_MESSAGES;
  cycleInterval?: number;
  initialDelay?: number;
  enabled?: boolean;
}

export function useCyclingMessage({
  messages,
  context = "PAGE_LOAD",
  cycleInterval = MESSAGE_CYCLE_CONFIG.CYCLE_INTERVAL,
  initialDelay = MESSAGE_CYCLE_CONFIG.INITIAL_DELAY,
  enabled = true,
}: UseCyclingMessageOptions = {}) {
  const messageArray = messages || COMBINED_MESSAGES[context];

  const [currentMessage, setCurrentMessage] = useState(() => messageArray[0]);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Timer handles — all owned and cleaned up by the cycling effect
  const initialDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cycleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const usedMessagesRef = useRef(new Set<string>());

  // Written synchronously during render so the advance() closure always reads
  // current values without capturing stale state.
  const messageArrayRef = useRef(messageArray);
  const currentMessageRef = useRef(currentMessage);
  messageArrayRef.current = messageArray;
  currentMessageRef.current = currentMessage;

  // Single effect owns the full lifecycle of the cycling timer.
  // Runs (and restarts cleanly) only when the cycling parameters actually change.
  useEffect(() => {
    if (!enabled) return;

    const stopTransition = () => {
      if (transitionRef.current !== null) {
        clearTimeout(transitionRef.current);
        transitionRef.current = null;
      }
    };

    const advance = () => {
      stopTransition();
      setIsTransitioning(true);

      transitionRef.current = setTimeout(() => {
        transitionRef.current = null;

        const arr = messageArrayRef.current;
        const available = arr.filter((m) => !usedMessagesRef.current.has(m));

        let next: string;
        if (available.length === 0) {
          usedMessagesRef.current.clear();
          const cur = currentMessageRef.current;
          if (cur) usedMessagesRef.current.add(cur);
          next = getRandomMessage(arr.filter((m) => m !== cur));
        } else {
          next = getRandomMessage(available);
        }

        usedMessagesRef.current.add(next);
        setCurrentMessage(next);
        setIsTransitioning(false);
      }, MESSAGE_CYCLE_CONFIG.TRANSITION_DURATION / 2);
    };

    initialDelayRef.current = setTimeout(() => {
      initialDelayRef.current = null;
      advance();
      cycleIntervalRef.current = setInterval(advance, cycleInterval);
    }, initialDelay);

    return () => {
      if (initialDelayRef.current !== null) {
        clearTimeout(initialDelayRef.current);
        initialDelayRef.current = null;
      }
      if (cycleIntervalRef.current !== null) {
        clearInterval(cycleIntervalRef.current);
        cycleIntervalRef.current = null;
      }
      stopTransition();
      setIsTransitioning(false);
    };
  }, [enabled, cycleInterval, initialDelay]);

  // When the message pool changes (context or messages prop), reset state
  // so the new pool starts fresh. The cycling effect does not need to restart
  // because advance() reads messageArrayRef.current at call time.
  useEffect(() => {
    usedMessagesRef.current.clear();
    setCurrentMessage(getRandomMessage(messageArray));
  }, [messageArray]);

  return { message: currentMessage, isTransitioning };
}
