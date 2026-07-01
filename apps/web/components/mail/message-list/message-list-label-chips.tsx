import type { LabelDef } from "@/lib/mail/types";
import { resolveLabelDisplayColor } from "@/lib/mail/mail-label-colors";

export function MessageListLabelChips({
  messageLabels,
  max = 2,
}: {
  messageLabels: LabelDef[];
  max?: number;
}) {
  if (messageLabels.length === 0) return null;
  const visible = messageLabels.slice(0, max);
  const overflow = messageLabels.length - visible.length;

  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden pr-4">
      {visible.map((label) => {
        const displayColor = resolveLabelDisplayColor(label.color);
        return (
          <span
            key={label.id}
            title={label.name}
            className="inline-flex max-w-[5.5rem] items-center gap-0.5 rounded px-1 py-px text-[10px] font-medium leading-none"
            style={{
              color: displayColor,
              backgroundColor: `${displayColor}1a`,
              border: `1px solid ${displayColor}40`,
            }}
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: displayColor }}
            />
            <span className="truncate">{label.name}</span>
          </span>
        );
      })}
      {overflow > 0 ? (
        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
