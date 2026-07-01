import { Button as ButtonPrimitive } from "@base-ui/react/button";

import { cn } from "@workspace/ui/lib/utils";
import { buttonVariants } from "./button-variants";

function Button({
	className = "",
	variant = "default",
	size = "default",
	animation = "all",
	children,
	...props
}) {
	return (
		<ButtonPrimitive
			data-slot="button"
			className={cn(
				buttonVariants({ variant, size, animation, className }),
				variant === "decorations" &&
					"relative rounded-none squircle-none overflow-visible",
			)}
			{...props}
		>
			{children}
			{variant === "decorations" && (
				<div className={cn("absolute -left-[1px] -top-[1px] z-10")}>
					<div className="relative">
						<div className="bg-muted-foreground w-[1px] h-[5px] rounded-full absolute top-0" />
						<div className="bg-muted-foreground w-[5px] h-[1px] rounded-full absolute left-0" />
					</div>
				</div>
			)}

			{variant === "decorations" && (
				<div className={cn("absolute -right-[0px] -top-[1px] z-10")}>
					<div className="relative">
						<div className="bg-muted-foreground w-[1px] h-[5px] rounded-full absolute top-0" />
						<div className="bg-muted-foreground w-[5px] h-[1px] rounded-full absolute -left-[4.5px]" />
					</div>
				</div>
			)}

			{variant === "decorations" && (
				<div className={cn("absolute -left-[1px] -bottom-[0px] z-10")}>
					<div className="relative">
						<div className="bg-muted-foreground w-[1px] h-[5px] rounded-full absolute -top-[4.5px]" />
						<div className="bg-muted-foreground w-[5px] h-[1px] rounded-full absolute left-0" />
					</div>
				</div>
			)}

			{variant === "decorations" && (
				<div className={cn("absolute -right-[0px] -bottom-[0px] z-10")}>
					<div className="relative">
						<div className="bg-muted-foreground w-[1px] h-[5px] rounded-full absolute -top-[4.5px]" />
						<div className="bg-muted-foreground w-[5px] h-[1px] rounded-full absolute -left-[4.5px]" />
					</div>
				</div>
			)}
		</ButtonPrimitive>
	);
}

Button.displayName = "Button";

export { Button };
