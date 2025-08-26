import { COMBINED_MESSAGES } from '../constants/loading-messages';
interface UseCyclingMessageOptions {
    messages?: readonly string[];
    context?: keyof typeof COMBINED_MESSAGES;
    cycleInterval?: number;
    initialDelay?: number;
    enabled?: boolean;
}
export declare function useCyclingMessage({ messages, context, cycleInterval, initialDelay, enabled }?: UseCyclingMessageOptions): {
    message: any;
    isTransitioning: boolean;
    changeMessage: () => void;
    startCycling: () => void;
    stopCycling: () => void;
};
export {};
//# sourceMappingURL=use-cycling-message.d.ts.map