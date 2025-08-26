import React from "react";
interface SettingsFormHeaderProps {
    title: string;
    description?: string;
    onBack?: () => void;
    loading?: boolean;
    actions?: React.ReactNode;
    className?: string;
}
export declare function SettingsFormHeader({ title, description, onBack, loading, actions, className, }: SettingsFormHeaderProps): React.JSX.Element;
interface SettingsFormContentProps {
    children: React.ReactNode;
    className?: string;
}
export declare function SettingsFormContent({ children, className, }: SettingsFormContentProps): React.JSX.Element;
interface SettingsFormFooterProps {
    children?: React.ReactNode;
    primaryAction?: {
        label: string;
        onClick: () => void;
        loading?: boolean;
        disabled?: boolean;
        variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    };
    secondaryAction?: {
        label: string;
        onClick: () => void;
        disabled?: boolean;
        variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    };
    className?: string;
}
export declare function SettingsFormFooter({ children, primaryAction, secondaryAction, className, }: SettingsFormFooterProps): React.JSX.Element;
interface SettingsFormProps {
    children: React.ReactNode;
    className?: string;
}
export declare function SettingsForm({ children, className }: SettingsFormProps): React.JSX.Element;
export declare namespace SettingsForm {
    var Header: typeof SettingsFormHeader;
    var Content: typeof SettingsFormContent;
    var Footer: typeof SettingsFormFooter;
}
export {};
//# sourceMappingURL=settings-form.d.ts.map