"use client";

import { useId, useReducer } from "react";
import { Copy, Download, LifeBuoy, Printer, Trash2 } from "lucide-react";
import { RECOVERY_KIT_NOTICE } from "@workspace/calendar-core/product-info";
import { Checkbox } from "@workspace/ui/components/ui/checkbox";
import { useRecoveryKit } from "@/hooks/use-recovery-kit";
import { InlineMessage } from "./account-settings-inline-message";
import type { SectionMessage } from "./account-settings-types";
import { getAccountSettingsErrorMessage } from "./account-settings-utils";
import {
  PaletteButton,
  PaletteField,
  PaletteFormActions,
  PaletteNavRow,
} from "./palette-ui";
import { PALETTE_INPUT_CLASS } from "./palette-styles";

type KitState =
  | { stage: "idle"; message: SectionMessage }
  | { stage: "password"; password: string; pending: boolean; message: SectionMessage }
  | { stage: "shown"; recoveryKey: string; saved: boolean; message: SectionMessage };

type KitAction =
  | { type: "open" }
  | { type: "password"; value: string }
  | { type: "submit" }
  | { type: "fail"; text: string }
  | { type: "created"; recoveryKey: string }
  | { type: "saved"; value: boolean }
  | { type: "notice"; message: SectionMessage }
  | { type: "close"; message?: SectionMessage };

const IDLE: KitState = { stage: "idle", message: null };

function reducer(state: KitState, action: KitAction): KitState {
  switch (action.type) {
    case "open":
      return { stage: "password", password: "", pending: false, message: null };
    case "password":
      return state.stage === "password" ? { ...state, password: action.value } : state;
    case "submit":
      return state.stage === "password" ? { ...state, pending: true, message: null } : state;
    case "fail":
      return state.stage === "password"
        ? { ...state, pending: false, message: { kind: "error", text: action.text } }
        : { ...state, message: { kind: "error", text: action.text } };
    case "created":
      return { stage: "shown", recoveryKey: action.recoveryKey, saved: false, message: null };
    case "saved":
      return state.stage === "shown" ? { ...state, saved: action.value } : state;
    case "notice":
      return { ...state, message: action.message };
    case "close":
      return { stage: "idle", message: action.message ?? null };
  }
}

function kitText(recoveryKey: string): string {
  return `Solace recovery kit\n\n${recoveryKey}\n\n${RECOVERY_KIT_NOTICE}\n`;
}

/** Hands the key to the browser's save dialog; nothing is written by the app itself. */
function downloadKit(recoveryKey: string) {
  const url = URL.createObjectURL(new Blob([kitText(recoveryKey)], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "solace-recovery-kit.txt";
  link.click();
  URL.revokeObjectURL(url);
}

/** A print-only sheet over the page for one print, so nothing else of the app reaches the paper. */
function printKit(recoveryKey: string) {
  const sheet = document.createElement("div");
  sheet.className =
    "fixed inset-0 z-[2147483647] hidden flex-col items-center justify-center gap-4 bg-background p-12 text-foreground print:flex";
  const lines: [string, string][] = [
    ["text-2xl font-semibold", "Solace recovery kit"],
    ["font-mono text-2xl tracking-wide", recoveryKey],
    ["max-w-md text-center text-sm", RECOVERY_KIT_NOTICE],
  ];
  for (const [className, text] of lines) {
    const line = document.createElement("p");
    line.className = className;
    line.textContent = text;
    sheet.append(line);
  }
  document.body.append(sheet);
  window.addEventListener("afterprint", () => sheet.remove(), { once: true });
  window.print();
}

function statusText(status: ReturnType<typeof useRecoveryKit>["status"]): string {
  if (status.isPending) return "Checking…";
  if (status.isError) return "Unable to check. Try again later.";
  if (!status.data.exists) return "Not set up. Without one, a forgotten password needs support.";
  const created = status.data.createdAt;
  return created ? `Created ${new Date(created).toISOString().slice(0, 10)}` : "Set up";
}

function ShownKit({
  recoveryKey,
  saved,
  dispatch,
}: {
  recoveryKey: string;
  saved: boolean;
  dispatch: (action: KitAction) => void;
}) {
  const copy = () => {
    navigator.clipboard.writeText(recoveryKey).then(
      () => dispatch({ type: "notice", message: { kind: "success", text: "Recovery key copied." } }),
      () => dispatch({ type: "fail", text: "Copy failed. Select the key and copy it yourself." }),
    );
  };

  return (
    <div className="p-2">
      <p
        aria-label="Recovery key"
        className="select-all break-all rounded-lg bg-muted px-3 py-3 text-center font-mono text-[15px] tracking-wide text-foreground"
      >
        {recoveryKey}
      </p>
      <p className="mt-2 text-[13px] leading-[130%] text-muted-foreground">{RECOVERY_KIT_NOTICE}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <PaletteButton onClick={copy}>
          <Copy className="size-3.5" aria-hidden="true" />
          Copy
        </PaletteButton>
        <PaletteButton onClick={() => downloadKit(recoveryKey)}>
          <Download className="size-3.5" aria-hidden="true" />
          Download .txt
        </PaletteButton>
        <PaletteButton onClick={() => printKit(recoveryKey)}>
          <Printer className="size-3.5" aria-hidden="true" />
          Print
        </PaletteButton>
      </div>
      <label className="mt-3 flex items-start gap-2 text-[13px] text-foreground">
        <Checkbox
          checked={saved}
          onCheckedChange={(value) => dispatch({ type: "saved", value: value === true })}
          aria-label="I saved my recovery key"
        />
        I saved my recovery key somewhere safe.
      </label>
      <PaletteFormActions>
        <PaletteButton
          variant="primary"
          disabled={!saved}
          onClick={() =>
            dispatch({ type: "close", message: { kind: "success", text: "Recovery kit ready." } })
          }
        >
          Done
        </PaletteButton>
      </PaletteFormActions>
    </div>
  );
}

/** The recovery kit row: creating one needs the current password, and the key is shown once and never kept. */
export function RecoveryKitSettings() {
  const fieldId = useId();
  const { status, create, remove } = useRecoveryKit();
  const [state, dispatch] = useReducer(reducer, IDLE);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (state.stage !== "password") return;
    if (!state.password) {
      dispatch({ type: "fail", text: "Enter your current password." });
      return;
    }
    dispatch({ type: "submit" });
    create(state.password).then(
      (recoveryKey) => dispatch({ type: "created", recoveryKey }),
      (error: unknown) => dispatch({ type: "fail", text: getAccountSettingsErrorMessage(error) }),
    );
  };

  const removeKit = () => {
    remove.mutateAsync().then(
      () => dispatch({ type: "notice", message: { kind: "success", text: "Recovery kit removed." } }),
      (error: unknown) => dispatch({ type: "fail", text: getAccountSettingsErrorMessage(error) }),
    );
  };

  return (
    <div>
      <InlineMessage msg={state.message} />
      {state.stage === "idle" ? (
        <>
          <PaletteNavRow
            icon={LifeBuoy}
            label={status.data?.exists ? "Create a new recovery kit" : "Recovery kit"}
            description={statusText(status)}
            onClick={() => dispatch({ type: "open" })}
          />
          {status.data?.exists ? (
            <PaletteNavRow
              icon={Trash2}
              label="Remove recovery kit"
              description="A forgotten password then needs support"
              trailing={null}
              disabled={remove.isPending}
              onClick={removeKit}
            />
          ) : null}
        </>
      ) : null}
      {state.stage === "password" ? (
        <form onSubmit={submit}>
          <PaletteField
            label="Current password"
            htmlFor={`${fieldId}-current`}
            hint="A new kit replaces any earlier one, which stops working."
          >
            <input
              id={`${fieldId}-current`}
              type="password"
              value={state.password}
              onChange={(event) => dispatch({ type: "password", value: event.target.value })}
              autoComplete="current-password"
              disabled={state.pending}
              className={PALETTE_INPUT_CLASS}
            />
          </PaletteField>
          <PaletteFormActions>
            <PaletteButton
              variant="ghost"
              onClick={() => dispatch({ type: "close" })}
              disabled={state.pending}
            >
              Cancel
            </PaletteButton>
            <PaletteButton type="submit" variant="primary" loading={state.pending}>
              Create recovery kit
            </PaletteButton>
          </PaletteFormActions>
        </form>
      ) : null}
      {state.stage === "shown" ? (
        <ShownKit recoveryKey={state.recoveryKey} saved={state.saved} dispatch={dispatch} />
      ) : null}
    </div>
  );
}
