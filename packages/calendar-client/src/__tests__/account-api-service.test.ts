import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { AccountApiService } from "../account-api-service";
import { HttpClient } from "../http-client";

describe("public signup configuration", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shares concurrent reads without caching completed requests", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ defaultEmailDomain: "solace.test" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const service = new AccountApiService(
      new HttpClient({ baseURL: "https://api.solace.test" }),
    );
    const first = service.getSignupConfig();
    const second = service.getSignupConfig();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { defaultEmailDomain: "solace.test" },
      { defaultEmailDomain: "solace.test" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await service.getSignupConfig();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
