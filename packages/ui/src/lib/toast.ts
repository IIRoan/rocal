import { toast as sonnerToast, type ExternalToast } from "sonner";

type ShowToast = typeof sonnerToast.message;

const UNTIL_DISMISSED = { duration: Number.POSITIVE_INFINITY, closeButton: true } satisfies ExternalToast;

/** WCAG 2.2.1: an error or a toast with an action stays until the user dismisses it. */
const keepOpen =
  (show: ShowToast, always: boolean): ShowToast =>
  (...args) => {
    const [message, data] = args;
    return always || data?.action ? show(message, { ...UNTIL_DISMISSED, ...data }) : show(...args);
  };

export const toast: typeof sonnerToast = Object.assign(keepOpen(sonnerToast, false), {
  ...sonnerToast,
  success: keepOpen(sonnerToast.success, false),
  info: keepOpen(sonnerToast.info, false),
  warning: keepOpen(sonnerToast.warning, false),
  error: keepOpen(sonnerToast.error, true),
  message: keepOpen(sonnerToast.message, false),
  loading: keepOpen(sonnerToast.loading, false),
});
