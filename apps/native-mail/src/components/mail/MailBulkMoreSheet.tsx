import React from "react";
import { MailSheetList } from "./MailSheetList";
import { SheetRow } from "@workspace/native-core/components/sheet";

interface MailBulkMoreSheetProps {
  showStar: boolean;
  showUnstar: boolean;
  showMove: boolean;
  showDeleteForever: boolean;
  onStar: () => void;
  onUnstar: () => void;
  onLabels: () => void;
  onMove: () => void;
  onDeleteForever: () => void;
}

export function MailBulkMoreSheet({
  showStar,
  showUnstar,
  showMove,
  showDeleteForever,
  onStar,
  onUnstar,
  onLabels,
  onMove,
  onDeleteForever,
}: MailBulkMoreSheetProps) {
  return (
    <MailSheetList>
      {showStar ? (
        <SheetRow variant="mail" icon="star" label="Star" onPress={onStar} />
      ) : null}
      {showUnstar ? (
        <SheetRow
          variant="mail"
          icon="star"
          label="Unstar"
          iconColor="#fbbf24"
          onPress={onUnstar}
          showDivider={showStar}
        />
      ) : null}
      <SheetRow
        variant="mail"
        icon="tag"
        label="Labels"
        accessory="chevron-right"
        onPress={onLabels}
        showDivider={showStar || showUnstar}
      />
      {showMove ? (
        <SheetRow
          variant="mail"
          icon="folder"
          label="Move to…"
          accessory="chevron-right"
          onPress={onMove}
          showDivider
        />
      ) : null}
      {showDeleteForever ? (
        <SheetRow
          variant="mail"
          icon="trash-2"
          label="Delete forever"
          destructive
          onPress={onDeleteForever}
          showDivider
        />
      ) : null}
    </MailSheetList>
  );
}
