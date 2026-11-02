import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("sonner", () => ({
  toast: Object.assign(jest.fn(), {
    success: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    message: jest.fn(),
    loading: jest.fn(),
    dismiss: jest.fn(),
  }),
}));

import { toast as sonnerToast } from "sonner";

import { toast } from "./toast";

const untilDismissed = { duration: Number.POSITIVE_INFINITY, closeButton: true };
const undo = { label: "Undo", onClick: () => {} };

describe("toast", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps an error open until dismissed", () => {
    toast.error("Not saved.", { description: "Try again." });

    expect(sonnerToast.error).toHaveBeenCalledWith("Not saved.", {
      ...untilDismissed,
      description: "Try again.",
    });
  });

  it("keeps any toast with an action open until dismissed", () => {
    toast.success("Message archived.", { action: undo });
    toast("Moved.", { action: undo });

    expect(sonnerToast.success).toHaveBeenCalledWith("Message archived.", { ...untilDismissed, action: undo });
    expect(sonnerToast).toHaveBeenCalledWith("Moved.", { ...untilDismissed, action: undo });
  });

  it("lets the caller override the defaults", () => {
    toast.error("Copied link failed.", { duration: 8000, closeButton: false });

    expect(sonnerToast.error).toHaveBeenCalledWith("Copied link failed.", { duration: 8000, closeButton: false });
  });

  it("leaves other toasts and methods unchanged", () => {
    toast.success("Saved.");
    toast.info("Syncing.", { duration: 3000 });
    toast.dismiss("toast-1");

    expect(sonnerToast.success).toHaveBeenCalledWith("Saved.");
    expect(sonnerToast.info).toHaveBeenCalledWith("Syncing.", { duration: 3000 });
    expect(sonnerToast.dismiss).toHaveBeenCalledWith("toast-1");
  });
});
