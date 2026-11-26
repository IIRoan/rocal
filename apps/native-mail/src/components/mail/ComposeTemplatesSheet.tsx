import type { MailTemplate } from "@workspace/calendar-core";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@workspace/native-core/components/BottomSheet";
import {
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetScroll,
} from "@workspace/native-core/components/sheet/SheetSections";

export function ComposeTemplatesSheet({
  visible,
  templates,
  onSelect,
  onDismiss,
}: {
  visible: boolean;
  templates: MailTemplate[];
  onSelect: (template: MailTemplate) => void;
  onDismiss: () => void;
}) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoints={[0.5]}>
      <BottomSheetHeader>
        <BottomSheetTitle>Insert template</BottomSheetTitle>
      </BottomSheetHeader>
      {templates.length === 0 ? (
        <SheetCenteredState message="No templates yet. Add one in Settings under Mail, then Templates." />
      ) : (
        <SheetScroll>
          <SheetGroup>
            {templates.map((template) => (
              <SheetItem
                key={template.id}
                icon="file-text"
                label={template.name}
                detail={template.subject || template.body.replace(/\s+/g, " ").trim()}
                onPress={() => onSelect(template)}
                accessibilityLabel={`Insert ${template.name}`}
              />
            ))}
          </SheetGroup>
        </SheetScroll>
      )}
    </BottomSheet>
  );
}
