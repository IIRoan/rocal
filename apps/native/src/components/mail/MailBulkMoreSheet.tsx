import React from "react";
import { MailSheetList } from "./MailSheetList";
import { SheetRow } from "../sheet";

interface MailBulkMoreSheetProps {
  showStar: boolean;
  showUnstar: boolean;
  showMove: boolean;
  onStar: () => void;
  onUnstar: () => void;
  onLabels: () => void;
  onMove: () => void;
}

export function MailBulkMoreSheet({
  showStar,
  showUnstar,
  showMove,
  onStar,
  onUnstar,
  onLabels,
  onMove,
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
    </MailSheetList>
  );
}
