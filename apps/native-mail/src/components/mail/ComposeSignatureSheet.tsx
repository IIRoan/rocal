import type { ComposeSignatureOption } from "@workspace/calendar-core";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@workspace/native-core/components/BottomSheet";
import {
  SheetGroup,
  SheetItem,
  SheetMessage,
  SheetScroll,
} from "@workspace/native-core/components/sheet/SheetSections";

export function ComposeSignatureSheet({
  visible,
  options,
  noneSelected,
  onSelect,
  onDismiss,
}: {
  visible: boolean;
  options: ComposeSignatureOption[];
  noneSelected: boolean;
  onSelect: (choice: string | null | undefined) => void;
  onDismiss: () => void;
}) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoints={[0.5]}>
      <BottomSheetHeader>
        <BottomSheetTitle>Signature</BottomSheetTitle>
      </BottomSheetHeader>
      <SheetScroll>
        <SheetGroup>
          {options.map((option) => (
            <SheetItem
              key={option.key}
              icon="edit-3"
              label={option.name}
              detail={option.preview}
              checked={option.selected}
              onPress={() => onSelect(option.choice)}
              accessibilityRole="radio"
              accessibilityState={{ checked: option.selected }}
            />
          ))}
          <SheetItem
            icon="slash"
            label="No signature"
            checked={noneSelected}
            onPress={() => onSelect(null)}
            accessibilityRole="radio"
            accessibilityState={{ checked: noneSelected }}
          />
        </SheetGroup>
        {options.length === 0 ? (
          <SheetMessage text="No signatures yet. Add one in Settings under Mail, then Signatures." />
        ) : null}
      </SheetScroll>
    </BottomSheet>
  );
}
