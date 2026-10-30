import type { ReactNode } from "react";
import { PaletteViewHeader } from "../command-palette/palette-ui";

export function CalendarManagerHeader({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children?: ReactNode;
}) {
  return <PaletteViewHeader title={title} onBack={onBack} actions={children} />;
}
