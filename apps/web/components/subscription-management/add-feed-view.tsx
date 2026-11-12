"use client";

import { normalizeSubscriptionFeedUrl } from "@workspace/calendar-ics";
import { Button } from "@workspace/ui/components/ui/button";
import { ColorPicker } from "@workspace/ui/components/ui/color-picker";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { PRESET_COLORS } from "../command-palette/navigation-config";
import { SubscriptionFeedUrlInfo } from "../subscription-feed-url-info";

import { SubscriptionViewHeader } from "./subscription-presentation";
import type { SubscriptionViewProps } from "./subscription-shared";
import {
  customSubscriptionSchema,
  type CustomSubscriptionForm,
  type SubscriptionFormErrors,
} from "./subscription-shared";

export function AddFeedView({
  onBack: goBackToMain,
  loading,
  createMutation,
  queryError,
  onRetry,
}: SubscriptionViewProps) {
  const [newSubscription, setNewSubscription] =
    useState<CustomSubscriptionForm>({ name: "", url: "", color: "indigo" });
  const [validationErrors, setValidationErrors] =
    useState<SubscriptionFormErrors>({});
  const normalizeSubscriptionUrl = normalizeSubscriptionFeedUrl;
  const validateForm = (): CustomSubscriptionForm | null => {
    const parsed = customSubscriptionSchema.safeParse(newSubscription);
    if (parsed.success) {
      setValidationErrors({});
      return parsed.data;
    }
    const errors: SubscriptionFormErrors = {};
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === "name") errors.name = issue.message;
      if (issue.path[0] === "url") errors.url = issue.message;
    }
    setValidationErrors(errors);
    return null;
  };
  const handleCreateSubscription = () => {
    const parsed = validateForm();
    if (!parsed) return;
    createMutation.mutate(
      {
        name: parsed.name,
        url: normalizeSubscriptionUrl(parsed.url),
        color: parsed.color,
      },
      {
        onSuccess: () => {
          setNewSubscription({ name: "", url: "", color: "indigo" });
          setValidationErrors({});
        },
      },
    );
  };
  return (
    <>
      <SubscriptionViewHeader
        queryError={queryError}
        onRetry={onRetry}
        title="Add External Feed"
        onBack={goBackToMain}
      />
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
        <div className="space-y-1.5">
          <Label
            htmlFor="subscription-name"
            className="text-[13px] font-medium text-muted-foreground"
          >
            Name
          </Label>
          <Input
            id="subscription-name"
            aria-invalid={Boolean(validationErrors.name)}
            aria-describedby={
              validationErrors.name ? "subscription-name-error" : undefined
            }
            value={newSubscription.name}
            onChange={(e) => {
              setNewSubscription((v) => ({ ...v, name: e.target.value }));
              if (validationErrors.name)
                setValidationErrors((prev) => ({
                  ...prev,
                  name: undefined,
                }));
            }}
            placeholder="e.g. Team Vacation Calendar"
            className={`h-9 text-sm ${validationErrors.name ? "border-destructive" : ""}`}
          />
          {validationErrors.name && (
            <p
              id="subscription-name-error"
              className="flex items-center gap-1 text-xs text-destructive"
            >
              <AlertCircle className="size-3" />
              {validationErrors.name}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label
              htmlFor="subscription-url"
              className="text-[13px] font-medium text-muted-foreground"
            >
              URL (.ics)
            </Label>
            <SubscriptionFeedUrlInfo />
          </div>
          <Input
            id="subscription-url"
            aria-invalid={Boolean(validationErrors.url)}
            aria-describedby={
              validationErrors.url ? "subscription-url-error" : undefined
            }
            value={newSubscription.url}
            onChange={(e) => {
              setNewSubscription((v) => ({ ...v, url: e.target.value }));
              if (validationErrors.url)
                setValidationErrors((prev) => ({
                  ...prev,
                  url: undefined,
                }));
            }}
            placeholder="https://example.com/calendar.ics"
            className={`h-9 text-sm ${validationErrors.url ? "border-destructive" : ""}`}
          />
          {validationErrors.url && (
            <p
              id="subscription-url-error"
              className="flex items-center gap-1 text-xs text-destructive"
            >
              <AlertCircle className="size-3" />
              {validationErrors.url}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-[13px] font-medium text-muted-foreground">
            Color
          </Label>
          <ColorPicker
            value={newSubscription.color}
            onChange={(color) => setNewSubscription((v) => ({ ...v, color }))}
            presetColors={PRESET_COLORS}
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="button"
            onClick={handleCreateSubscription}
            disabled={loading}
            className="h-9"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-3.5 animate-spin" />
                Adding…
              </>
            ) : (
              <>
                <Plus className="mr-2 size-3.5" />
                Add feed
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
