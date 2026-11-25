import { cn } from "../../lib/utils";
import mark from "./solace-mark.png";

const maskStyle = { maskImage: `url(${mark.src})` };

export function LogoMark({ className, label }: { className: string; label?: string }) {
  return (
    <span
      className={cn("inline-block shrink-0 bg-accent mask-contain mask-no-repeat", className)}
      style={maskStyle}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
