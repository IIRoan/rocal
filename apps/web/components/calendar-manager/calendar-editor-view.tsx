import type { Dispatch } from "react";
import {
  EncryptionStatusBadge,
  getColorSwatchValue,
} from "@workspace/ui/components/calendar";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";
import { Loader2, Save, Star, Trash2 } from "lucide-react";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import {
  handleCalendarCreate,
  handleCalendarDelete,
  handleCalendarUpdate,
} from "../command-palette/calendar-utils";
import { PRESET_COLORS } from "../command-palette/navigation-config";
import { SettingToggleRow } from "../command-palette/setting-toggle-row";
import {
  calendarFormSetters,
  type CalendarFormAction,
  type CalendarFormState,
} from "./calendar-form-state";
import { CalendarManagerHeader } from "./calendar-manager-header";

const EDITOR_COPY = {
  create: { title: "Create Calendar", submit: "Create", busy: "Creating…" },
  edit: { title: "Edit Calendar", submit: "Save", busy: "Saving…" },
};

type CalendarEditorProps = {
  mode: keyof typeof EDITOR_COPY;
  form: CalendarFormState;
  dispatch: Dispatch<CalendarFormAction>;
  onBack: () => void;
};

function CalendarFormFields({
  form,
  dispatch,
}: Pick<CalendarEditorProps, "form" | "dispatch">) {
  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="px-4 pt-4 pb-3 space-y-3">
        <div className="space-y-1.5">
          <Label
            htmlFor="calendar-name"
            className="text-xs text-muted-foreground"
          >
            Name
          </Label>
          <Input
            id="calendar-name"
            value={form.name}
            onChange={(e) =>
              dispatch({ type: "changeName", name: e.target.value })
            }
            placeholder="Calendar name"
            className={`h-8 text-sm ${form.errors.name ? "border-destructive" : ""}`}
          />
          {form.errors.name && (
            <p className="text-xs text-destructive">{form.errors.name}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Color</Label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((preset) => (
              <SimpleTooltip content={preset.label} key={preset.value}>
                <button
                  type="button"
                  onClick={() =>
                    dispatch({ type: "changeColor", color: preset.value })
                  }
                  className={`size-6 rounded-full border-2 transition-[border-color,transform,box-shadow] ${
                    form.color === preset.value
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
          </div>
          {form.errors.color && (
            <p className="text-xs text-destructive">{form.errors.color}</p>
          )}
        </div>
      </div>

      <div className="p-1 border-t border-border/50 mt-1">
        <SettingToggleRow
          checked={form.isDefault}
          description="Use this calendar by default for new events."
          icon={Star}
          label="Default calendar"
          onToggle={() => dispatch({ type: "toggleDefault" })}
        />
      </div>
    </div>
  );
}

export function CalendarEditorView({
  mode,
  form,
  dispatch,
  onBack,
}: CalendarEditorProps) {
  const calendarData = useSharedCalendarData();
  const { calendars } = calendarData;
  const setters = calendarFormSetters(dispatch);
  const copy = EDITOR_COPY[mode];
  const { name, color, isDefault, saving, editingCalendar } = form;
  const editedCalendar = mode === "edit" ? editingCalendar : null;

  const submit = () =>
    mode === "create"
      ? handleCalendarCreate(
          name,
          color,
          isDefault,
          calendars,
          calendarData,
          setters,
          onBack,
        )
      : handleCalendarUpdate(
          name,
          color,
          isDefault,
          calendars,
          editingCalendar,
          calendarData,
          setters,
          onBack,
        );

  return (
    <div className="flex flex-col">
      <CalendarManagerHeader title={copy.title} onBack={onBack}>
        {editedCalendar && (
          <EncryptionStatusBadge
            item={editedCalendar}
            kind="calendar"
            hidePlaintext={false}
            className="ml-auto"
            showLabel
          />
        )}
      </CalendarManagerHeader>

      <CalendarFormFields form={form} dispatch={dispatch} />

      <div className="border-t border-border/50 px-4 py-3 flex items-center justify-between shrink-0">
        {editedCalendar && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              handleCalendarDelete(
                editedCalendar,
                calendarData,
                setters.setCalendarSaving,
                onBack,
              )
            }
            disabled={saving}
            className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
            ) : (
              <Trash2 className="size-3.5 mr-1.5" />
            )}
            Delete
          </Button>
        )}
        <div className="ml-auto">
          <Button
            size="sm"
            onClick={submit}
            disabled={saving || !name.trim()}
            className="h-8"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
            ) : (
              <Save className="size-3.5 mr-1.5" />
            )}
            {saving ? copy.busy : copy.submit}
          </Button>
        </div>
      </div>
    </div>
  );
}
