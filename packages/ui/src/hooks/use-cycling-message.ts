import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  COMBINED_MESSAGES, 
  getRandomMessage, 
  MESSAGE_CYCLE_CONFIG 
} from '../constants/loading-messages';

interface UseCyclingMessageOptions {
  messages?: readonly string[];
  context?: keyof typeof COMBINED_MESSAGES;
  cycleInterval?: number;
  initialDelay?: number;
  enabled?: boolean;
}

export function useCyclingMessage({
  messages,
  context = 'PAGE_LOAD',
  cycleInterval = MESSAGE_CYCLE_CONFIG.CYCLE_INTERVAL,
  initialDelay = MESSAGE_CYCLE_CONFIG.INITIAL_DELAY,
  enabled = true
}: UseCyclingMessageOptions = {}) {
  // Determine which message array to use
  const messageArray = messages || COMBINED_MESSAGES[context];
  
  // Use first message initially to avoid hydration mismatch
  const [currentMessage, setCurrentMessage] = useState(() => 
    messageArray[0]
  );
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isClient, setIsClient] = useState(false);
  
  // Refs to track intervals and used messages
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const usedMessagesRef = useRef<Set<string>>(new Set());
  const initialDelayRef = useRef<NodeJS.Timeout | null>(null);
  
  // Get next message ensuring variety
  const getNextMessage = useCallback(() => {
    const availableMessages = messageArray.filter(
      msg => !usedMessagesRef.current.has(msg)
    );
    
    // If we've used all messages, reset the used set but keep current message out
    if (availableMessages.length === 0) {
      usedMessagesRef.current.clear();
      if (currentMessage) {
        usedMessagesRef.current.add(currentMessage);
        return getRandomMessage(messageArray.filter(msg => msg !== currentMessage));
      }
      return getRandomMessage(messageArray);
    }
    
    return getRandomMessage(availableMessages);
  }, [messageArray, currentMessage]);
  
  // Change message with transition
  const changeMessage = useCallback(() => {
    if (!enabled) return;
    
    setIsTransitioning(true);
    
    setTimeout(() => {
      const nextMessage = getNextMessage();
      setCurrentMessage(nextMessage);
      usedMessagesRef.current.add(nextMessage);
      setIsTransitioning(false);
    }, MESSAGE_CYCLE_CONFIG.TRANSITION_DURATION / 2);
  }, [enabled, messageArray, currentMessage]);
  
  // Start cycling
  const startCycling = useCallback(() => {
    if (!enabled) return;
    
    // Clear any existing intervals
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (initialDelayRef.current) {
      clearTimeout(initialDelayRef.current);
    }
    
    // Set initial message in used set
    if (currentMessage) {
      usedMessagesRef.current.add(currentMessage);
    }
    
    // Start cycling after initial delay
    initialDelayRef.current = setTimeout(() => {
      changeMessage(); // Change immediately after initial delay
      
      // Then start regular cycling
      intervalRef.current = setInterval(changeMessage, cycleInterval);
    }, initialDelay);
  }, [enabled, currentMessage, cycleInterval, initialDelay]);
  
  // Stop cycling
  const stopCycling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (initialDelayRef.current) {
      clearTimeout(initialDelayRef.current);
      initialDelayRef.current = null;
    }
    setIsTransitioning(false);
  }, []);
  
  // Effect to detect client-side hydration
  useEffect(() => {
    setIsClient(true);
    // Set random initial message after hydration
    const randomMessage = getRandomMessage(messageArray);
    setCurrentMessage(randomMessage);
    usedMessagesRef.current.add(randomMessage);
  }, [messageArray]);

  // Effect to start/stop cycling based on enabled state and client hydration
  useEffect(() => {
    if (enabled && isClient) {
      startCycling();
    } else {
      stopCycling();
    }
    
    return stopCycling;
  }, [enabled, isClient]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCycling();
    };
  }, []);
  
  // Reset when context or messages change
  useEffect(() => {
    if (!isClient) return;
    
    usedMessagesRef.current.clear();
    const newMessage = getRandomMessage(messageArray);
    setCurrentMessage(newMessage);
    
    if (enabled) {
      stopCycling();
      startCycling();
    }
  }, [context, messages, enabled, messageArray, isClient]);
  
  return {
    message: currentMessage,
    isTransitioning,
    changeMessage: enabled ? changeMessage : () => {},
    startCycling: enabled ? startCycling : () => {},
    stopCycling
  };
}