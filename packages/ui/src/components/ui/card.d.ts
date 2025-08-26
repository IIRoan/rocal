import * as React from "react";
interface CardProps extends React.ComponentProps<"div"> {
    hoverable?: boolean;
    animated?: boolean;
}
declare function Card({ className, hoverable, animated, ...props }: CardProps): React.JSX.Element;
declare function CardHeader({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CardTitle({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CardDescription({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CardAction({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CardContent({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CardFooter({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent, };
//# sourceMappingURL=card.d.ts.map