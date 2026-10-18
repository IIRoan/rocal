import { afterEach, beforeEach, jest } from "@jest/globals";

process.env.TZ = "UTC";

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});
