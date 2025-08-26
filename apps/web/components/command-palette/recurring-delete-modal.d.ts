import React from "react";
interface RecurringDeleteModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    eventTitle: string;
    onDeleteThis?: () => void;
    onDeleteAll: () => void;
    loading?: boolean;
}
export declare function RecurringDeleteModal({ open, onOpenChange, eventTitle, onDeleteThis, onDeleteAll, loading, }: RecurringDeleteModalProps): React.JSX.Element;
export {};
//# sourceMappingURL=recurring-delete-modal.d.ts.map