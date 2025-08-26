export interface TimeValidationResult {
    isValid: boolean;
    time?: string;
    error?: string;
}
export declare const formatTimeForInput: (date: Date) => string;
export declare const validateTime: (timeString: string) => TimeValidationResult;
export declare const timeToMinutes: (timeString: string) => number;
export declare const minutesToTime: (totalMinutes: number) => string;
export declare const scrollToSelectedTime: (dropdownRef: React.RefObject<HTMLDivElement | null>, selectedTime: string) => void;
export declare const generateAllTimeOptions: (timeFormat?: string) => {
    value: string;
    label: string;
}[];
//# sourceMappingURL=time-utils.d.ts.map