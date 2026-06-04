import { registerClearSession, triggerSessionClear } from "./session-clear";

describe("session-clear", () => {
  it("triggers the latest registered clear-session callback", () => {
    const first = jest.fn();
    const second = jest.fn();

    registerClearSession(first);
    registerClearSession(second);
    triggerSessionClear();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
