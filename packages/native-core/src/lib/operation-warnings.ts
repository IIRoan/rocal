import {
  getOperationWarningMessages,
} from "@workspace/calendar-core";
import type { ToastVariant } from "../providers/ToastProvider";

export function toastOperationWarnings(
  toast: (message: string, variant?: ToastVariant) => void,
  payload: unknown,
) {
  for (const message of getOperationWarningMessages(payload)) {
    toast(message, "info");
  }
}
