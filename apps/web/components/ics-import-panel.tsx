"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  getErrorMessage,
  partitionCalendarsByKind,
} from "@workspace/calendar-core";
import { getColorSwatchValue } from "@workspace/ui/components/calendar";
import { Button } from "@workspace/ui/components/ui/button";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  FileText,
  Loader2,
  Upload,
} from "lucide-react";

import { useImportIcs } from "@/hooks/use-import-ics";
import type { Calendar } from "@/lib/types/calendar";

type PickedIcsFile = { name: string; content: string };

interface IcsImportPanelProps {
  calendars: Calendar[];
  onBack: () => void;
}

function isIcsFileName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".ics");
}

export function IcsImportPanel({ calendars, onBack }: IcsImportPanelProps) {
  const importIcs = useImportIcs();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickedFile, setPickedFile] = useState<PickedIcsFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importCalendarId, setImportCalendarId] = useState<string>();

  const { ownedCalendars } = useMemo(
    () => partitionCalendarsByKind(calendars),
    [calendars],
  );
  const selectedCalendarId =
    importCalendarId ??
    (ownedCalendars.find((calendar) => calendar.isDefault) ?? ownedCalendars[0])
      ?.id;
  const hasOwnedCalendars = ownedCalendars.length > 0;

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!isIcsFileName(file.name)) {
      setFileError("Choose a .ics calendar file to import");
      return;
    }
    try {
      setPickedFile({ name: file.name, content: await file.text() });
      setFileError(null);
      importIcs.reset();
    } catch (error) {
      setFileError(getErrorMessage(error, "Failed to read the selected file"));
    }
  };

  const handleImport = () => {
    if (!pickedFile || !selectedCalendarId) return;
    importIcs.mutate(
      {
        calendarId: selectedCalendarId,
        icsContent: pickedFile.content,
        fileName: pickedFile.name,
      },
      { onSuccess: () => setPickedFile(null) },
    );
  };

  const errorMessage =
    fileError ??
    (importIcs.error
      ? getErrorMessage(importIcs.error, "Failed to import .ics file")
      : null);

  return (
    <>
      <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="p-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
        </button>
        <FileText className="size-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium">Import .ics File</span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
          File
        </div>
        <div className="p-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            aria-label="Choose .ics file"
            onChange={(event) => void handleFileChange(event)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!hasOwnedCalendars || importIcs.isPending}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors cursor-pointer disabled:cursor-default disabled:opacity-60"
          >
            <FileText className="size-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">
                {pickedFile ? pickedFile.name : "Choose file"}
              </div>
              {pickedFile ? (
                <div className="text-xs text-muted-foreground">
                  Click to choose another file
                </div>
              ) : null}
            </div>
            <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
          </button>
        </div>
        <p className="px-4 pb-2 text-xs text-muted-foreground">
          {hasOwnedCalendars
            ? "Events are copied once into the calendar you choose."
            : "Create a calendar before importing events from a file."}
        </p>

        {errorMessage ? (
          <p
            role="alert"
            className="mx-4 mb-2 flex items-center gap-1 text-xs text-destructive"
          >
            <AlertCircle className="size-3 shrink-0" />
            {errorMessage}
          </p>
        ) : null}

        {pickedFile && hasOwnedCalendars ? (
          <>
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">
              Import into
            </div>
            <div role="radiogroup" aria-label="Import into" className="p-1">
              {ownedCalendars.map((calendar) => {
                const selected = calendar.id === selectedCalendarId;
                return (
                  <button
                    key={calendar.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setImportCalendarId(calendar.id)}
                    className="flex items-center gap-2.5 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors cursor-pointer"
                  >
                    <span
                      className="size-3.5 rounded-sm shrink-0"
                      style={{
                        backgroundColor: getColorSwatchValue(calendar.color),
                      }}
                    />
                    <span className="text-sm flex-1 truncate">
                      {calendar.name}
                    </span>
                    {calendar.isDefault ? (
                      <span className="text-xs text-muted-foreground/70 shrink-0">
                        Default
                      </span>
                    ) : null}
                    {selected ? (
                      <Check className="size-3.5 text-primary shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </div>

      {pickedFile && hasOwnedCalendars ? (
        <div className="border-t border-border/50 px-4 py-3 flex justify-end shrink-0">
          <Button
            type="button"
            size="sm"
            onClick={handleImport}
            disabled={importIcs.isPending || !selectedCalendarId}
            className="h-8"
          >
            {importIcs.isPending ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Upload className="mr-1.5 size-3.5" />
                Import events
              </>
            )}
          </Button>
        </div>
      ) : null}
    </>
  );
}
