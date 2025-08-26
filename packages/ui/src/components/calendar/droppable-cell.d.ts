interface DroppableCellProps {
    id: string;
    date: Date;
    time?: number;
    children?: React.ReactNode;
    className?: string;
    onClick?: () => void;
}
export declare function DroppableCell({ id, date, time, children, className, onClick, }: DroppableCellProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=droppable-cell.d.ts.map