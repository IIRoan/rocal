import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetHeader,
  BottomSheetTitle,
} from "../BottomSheet";
import { SheetRow } from "../sheet";
import { MailSheetList } from "./MailSheetList";

export type ComposeMoreAction =
  | "toggle-cc-bcc"
  | "choose-identity"
  | "insert-signature"
  | "delete-draft";

type ComposeMoreSheetProps = {
  visible: boolean;
  showCcBcc: boolean;
  canChooseIdentity: boolean;
  canInsertSignature: boolean;
  canDeleteDraft: boolean;
  onSelect: (action: ComposeMoreAction) => void;
  onDismiss: () => void;
  onCloseComplete?: () => void;
};

export function ComposeMoreSheet({
  visible,
  showCcBcc,
  canChooseIdentity,
  canInsertSignature,
  canDeleteDraft,
  onSelect,
  onDismiss,
  onCloseComplete,
}: ComposeMoreSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      onCloseComplete={onCloseComplete}
      snapPoints={[0.4]}
    >
      <BottomSheetHeader>
        <BottomSheetTitle>Options</BottomSheetTitle>
      </BottomSheetHeader>
      <BottomSheetBody>
        <MailSheetList>
          <SheetRow
            variant="mail"
            icon="users"
            label={showCcBcc ? "Hide Cc and Bcc" : "Show Cc and Bcc"}
            onPress={() => onSelect("toggle-cc-bcc")}
          />
          {canChooseIdentity ? (
            <SheetRow
              variant="mail"
              icon="at-sign"
              label="Send from…"
              accessory="chevron-right"
              onPress={() => onSelect("choose-identity")}
              showDivider
            />
          ) : null}
          {canInsertSignature ? (
            <SheetRow
              variant="mail"
              icon="edit-3"
              label="Insert signature"
              onPress={() => onSelect("insert-signature")}
              showDivider
            />
          ) : null}
          {canDeleteDraft ? (
            <SheetRow
              variant="mail"
              icon="trash-2"
              label="Delete draft"
              destructive
              onPress={() => onSelect("delete-draft")}
              showDivider
            />
          ) : null}
        </MailSheetList>
      </BottomSheetBody>
    </BottomSheet>
  );
}
