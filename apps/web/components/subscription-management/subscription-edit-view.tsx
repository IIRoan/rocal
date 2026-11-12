"use client";

import type { CalendarSubscription } from "@/lib/types/calendar";
import { getColorSwatchValue } from "@workspace/ui/components/calendar";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { PRESET_COLORS } from "../command-palette/navigation-config";

import type { Dispatch, SetStateAction } from "react";
import {
  SubscriptionStatusBadge,
  SubscriptionViewHeader,
} from "./subscription-presentation";
import type { SubscriptionViewProps } from "./subscription-shared";
import {
  editableSubscriptionSchema,
  resolveSubscriptionEditValues,
  type SubscriptionEditErrors,
} from "./subscription-shared";
import {
  HolidaySubscriptionInfo,
  SubscriptionSyncInfo,
} from "./subscription-source-info";

export function SubscriptionEditView({
  calendarId,
  subscriptions,
  calendars,
  onBack: goBackToMain,
  onDelete: handleDeleteSubscription,
  loading,
  updateMutation,
  syncMutation,
  queryError,
  onRetry,
}: SubscriptionViewProps & { calendarId: string }) {
  const [override, setOverride] = useState<{ name?: string; color?: string }>(
    {},
  );
  const [editValidationErrors, setEditValidationErrors] =
    useState<SubscriptionEditErrors>({});
  const editingSubscriptionData =
    subscriptions.find(
      (subscription) => subscription.calendar.id === calendarId,
    ) ?? null;
  const editingCalendarEntry = calendars.find(
    (calendar) => calendar.id === calendarId,
  );
  const {
    name: editingName,
    color: editingColor,
    isHoliday: isHolidayCalendar,
  } = resolveSubscriptionEditValues(
    editingSubscriptionData,
    editingCalendarEntry,
    override,
  );
  const updateEditField = (field: "name" | "color", value: string) =>
    setOverride((current) => ({ ...current, [field]: value }));
  const handleSyncSubscription = (subscription: CalendarSubscription) =>
    syncMutation.mutate(subscription.id);
  const handleUpdateSubscription = () => {
    if (!editingSubscriptionData) return;
    const parsed = editableSubscriptionSchema.safeParse({
      name: editingName,
      color: editingColor,
    });
    if (!parsed.success) {
      const errors: SubscriptionEditErrors = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "name") errors.name = issue.message;
        if (issue.path[0] === "color") errors.color = issue.message;
      }
      setEditValidationErrors(errors);
      return;
    }
    setEditValidationErrors({});
    updateMutation.mutate({
      id: editingSubscriptionData.id,
      request: { name: parsed.data.name, color: parsed.data.color },
    });
  };
  return (
    <>
      <SubscriptionViewHeader
        queryError={queryError}
        onRetry={onRetry}
        title={isHolidayCalendar ? "Holiday Calendar" : "External Calendar"}
        onBack={goBackToMain}
        actions={
          editingSubscriptionData && !isHolidayCalendar ? (
            <SubscriptionStatusBadge
              status={editingSubscriptionData.lastSyncStatus}
              lastErrorMessage={editingSubscriptionData.lastErrorMessage}
            />
          ) : undefined
        }
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 py-2 text-[13px] font-medium text-muted-foreground">
          Calendar
        </div>
        <SubscriptionEditFields
          editingName={editingName}
          editingColor={editingColor}
          editValidationErrors={editValidationErrors}
          updateEditField={updateEditField}
          setEditValidationErrors={setEditValidationErrors}
        />

        {isHolidayCalendar && editingSubscriptionData ? (
          <HolidaySubscriptionInfo subscription={editingSubscriptionData} />
        ) : null}

        {!isHolidayCalendar ? (
          <SubscriptionSyncInfo
            subscription={editingSubscriptionData}
            loading={loading}
            syncPending={syncMutation.isPending}
            onSync={handleSyncSubscription}
          />
        ) : null}
      </div>
      <div className="border-t border-border/50 px-4 py-3 flex items-center justify-between shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            editingSubscriptionData &&
            handleDeleteSubscription(editingSubscriptionData)
          }
          disabled={loading || !editingSubscriptionData}
          className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="mr-1.5 size-3.5" />
          Remove
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleUpdateSubscription}
          disabled={loading || !editingSubscriptionData}
          className="h-8"
        >
          {updateMutation.isPending ? (
            <>
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </>
  );
}

function SubscriptionEditFields({
  editingName,
  editingColor,
  editValidationErrors,
  updateEditField,
  setEditValidationErrors,
}: {
  editingName: string;
  editingColor: string;
  editValidationErrors: SubscriptionEditErrors;
  updateEditField: (field: "name" | "color", value: string) => void;
  setEditValidationErrors: Dispatch<SetStateAction<SubscriptionEditErrors>>;
}) {
  return (
    <div className="px-4 pb-3 space-y-3">
      <div className="space-y-1.5">
        <Label
          htmlFor="edit-subscription-name"
          className="text-xs text-muted-foreground"
        >
          Name
        </Label>
        <Input
          id="edit-subscription-name"
          aria-invalid={Boolean(editValidationErrors.name)}
          aria-describedby={
            editValidationErrors.name
              ? "edit-subscription-name-error"
              : undefined
          }
          value={editingName}
          onChange={(e) => {
            updateEditField("name", e.target.value);
            if (editValidationErrors.name)
              setEditValidationErrors((prev) => ({
                ...prev,
                name: undefined,
              }));
          }}
          className={`h-8 text-sm ${editValidationErrors.name ? "border-destructive" : ""}`}
        />
        {editValidationErrors.name && (
          <p
            id="edit-subscription-name-error"
            className="flex items-center gap-1 text-xs text-destructive"
          >
            <AlertCircle className="size-3" />
            {editValidationErrors.name}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label
          id="subscription-color-label"
          className="text-xs text-muted-foreground"
        >
          Color
        </Label>
        <fieldset
          aria-labelledby="subscription-color-label"
          className="flex min-w-0 flex-wrap gap-2"
        >
          {PRESET_COLORS.map((preset) => (
            <SimpleTooltip content={preset.label} key={preset.value}>
              <button
                type="button"
                aria-pressed={editingColor === preset.value}
                onClick={() => {
                  updateEditField("color", preset.value);
                  if (editValidationErrors.color)
                    setEditValidationErrors((prev) => ({
                      ...prev,
                      color: undefined,
                    }));
                }}
                className={`size-6 rounded-full border-2 transition-[border-color,transform,box-shadow] motion-reduce:transition-none ${
                  editingColor === preset.value
                    ? "border-foreground scale-110"
                    : "border-transparent hover:scale-105"
                }`}
                style={{
                  backgroundColor: getColorSwatchValue(preset.value),
                }}
                aria-label={preset.label}
              />
            </SimpleTooltip>
          ))}
        </fieldset>
        {editValidationErrors.color && (
          <p className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="size-3" />
            {editValidationErrors.color}
          </p>
        )}
      </div>
    </div>
  );
}
