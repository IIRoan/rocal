import { useState } from "react";
import { isSafeEmailUrl } from "@workspace/calendar-core/sanitize-email-html";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@workspace/native-core/components/BottomSheet";
import {
  SheetButton,
  SheetGroup,
  SheetMessage,
  SheetScroll,
  SheetTextField,
} from "@workspace/native-core/components/sheet/SheetSections";
import { normalizeComposeLink } from "../../lib/mail/compose-link";

/** Link drawer: the current link prefilled, Apply sets it on the selection (or inserts it), Remove unlinks. */
export function ComposeLinkSheet({
  visible,
  currentLink,
  onApply,
  onRemove,
  onDismiss,
}: {
  visible: boolean;
  currentLink: string | null;
  onApply: (href: string) => void;
  onRemove: () => void;
  onDismiss: () => void;
}) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoints={[0.45]}>
      <BottomSheetHeader>
        <BottomSheetTitle>{currentLink ? "Edit link" : "Add link"}</BottomSheetTitle>
      </BottomSheetHeader>
      {visible ? (
        <ComposeLinkForm currentLink={currentLink} onApply={onApply} onRemove={onRemove} />
      ) : null}
    </BottomSheet>
  );
}

function ComposeLinkForm({
  currentLink,
  onApply,
  onRemove,
}: {
  currentLink: string | null;
  onApply: (href: string) => void;
  onRemove: () => void;
}) {
  const [value, setValue] = useState(currentLink ?? "");
  const href = normalizeComposeLink(value);
  const invalid = Boolean(href) && !isSafeEmailUrl("a", "href", href);
  return (
    <SheetScroll>
      <SheetGroup>
        <SheetTextField
          value={value}
          onChangeText={setValue}
          placeholder="https://"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => {
            if (href && !invalid) onApply(href);
          }}
          accessibilityLabel="Link address"
        />
      </SheetGroup>
      {invalid ? <SheetMessage text="Use a web, mail or phone link." tone="destructive" /> : null}
      <SheetButton label="Apply" icon="link" onPress={() => onApply(href)} disabled={!href || invalid} />
      {currentLink ? (
        <SheetButton label="Remove link" variant="destructive" onPress={onRemove} />
      ) : null}
    </SheetScroll>
  );
}
