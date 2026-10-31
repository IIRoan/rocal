import { Trophy } from "lucide-react";
import type { PaletteView as PaletteViewId } from "./constants";
import { PaletteNavRow, PaletteSection, PaletteView } from "./palette-ui";

export function SpecialSettings({
  goBack,
  goForward,
}: {
  goBack: () => void;
  goForward: (view: PaletteViewId) => void;
}) {
  return (
    <PaletteView title="Special" onBack={goBack}>
      <PaletteSection>
        <PaletteNavRow
          icon={Trophy}
          label="Riftbound"
          description="Import events from your frequent stores"
          onClick={() => goForward("riftbound")}
        />
      </PaletteSection>
    </PaletteView>
  );
}
