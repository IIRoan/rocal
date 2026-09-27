import {
  RECURRENCE_VALIDATION_FAILED_MESSAGE,
  checkEventRecurrence,
} from "./event-recurrence-validation";

const weekly = JSON.stringify({ frequency: "weekly", interval: 1, byWeekDay: [1] });

describe("checkEventRecurrence", () => {
  it("skips the server for events that do not repeat", async () => {
    const validate = jest.fn();
    await expect(checkEventRecurrence("", validate)).resolves.toBeNull();
    await expect(checkEventRecurrence(undefined, validate)).resolves.toBeNull();
    expect(validate).not.toHaveBeenCalled();
  });

  it("allows a rule the server accepts", async () => {
    const validate = jest.fn().mockResolvedValue({ valid: true, errors: [] });
    await expect(checkEventRecurrence(weekly, validate)).resolves.toBeNull();
    expect(validate).toHaveBeenCalledWith(weekly);
  });

  it("reports the server's errors for an invalid rule", async () => {
    const validate = jest.fn().mockResolvedValue({
      valid: false,
      errors: ["Interval must be at least 1", "Count must be positive"],
    });
    await expect(checkEventRecurrence(weekly, validate)).resolves.toBe(
      "Invalid recurrence rule: Interval must be at least 1, Count must be positive",
    );
  });

  it("blocks saving when the check itself fails", async () => {
    const validate = jest.fn().mockRejectedValue(new Error("offline"));
    await expect(checkEventRecurrence(weekly, validate)).resolves.toBe(
      RECURRENCE_VALIDATION_FAILED_MESSAGE,
    );
  });
});
