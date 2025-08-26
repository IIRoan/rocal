interface UseAutocompleteTimepickerProps {
    is24Hour?: boolean;
    locale?: string;
    timeZone?: string;
}
export declare function useAutocompleteTimepicker({ is24Hour, locale, timeZone, }: UseAutocompleteTimepickerProps): {
    timeOptions: Date[];
    formatTime: (date: Date) => string;
};
export {};
//# sourceMappingURL=use-autocomplete-timepicker.d.ts.map