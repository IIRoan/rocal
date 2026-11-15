import { describe, expect, it, jest } from "@jest/globals";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import type { VacationResponse, VacationResponseUpdate } from "@workspace/calendar-core";

import {
  saveVacationResponseMutationOptions,
  vacationResponseQueryOptions,
} from "../mail-vacation-response-query-options";

const KEY = ["mail", "vacation-response", "synthetic-user"] as const;
const stored: VacationResponse = { id: "singleton", isEnabled: false, textBody: "Old reply" };
const update: VacationResponseUpdate = {
  isEnabled: true,
  fromDate: null,
  toDate: null,
  subject: null,
  textBody: "Back on Monday.",
  htmlBody: null,
};

function setup(save: () => Promise<void>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const getVacationResponse = jest.fn(async (_session: string) => stored);
  const setVacationResponse = jest.fn(async (_session: string, _update: VacationResponseUpdate) => save());
  const connection = { client: { getVacationResponse, setVacationResponse }, session: "synthetic-session" };
  queryClient.setQueryData(KEY, stored, { updatedAt: 1 });
  const observer = new MutationObserver(queryClient, saveVacationResponseMutationOptions(KEY, connection, queryClient));
  return { queryClient, getVacationResponse, setVacationResponse, observer };
}

describe("vacation response query options", () => {
  it("leaves the cached reply and its timestamp alone when a save fails, so the form keeps the draft", async () => {
    const { queryClient, getVacationResponse, observer } = setup(async () => {
      throw new Error("Field could not be set.");
    });

    await expect(observer.mutate(update)).rejects.toThrow("Field could not be set.");

    expect(queryClient.getQueryData(KEY)).toEqual(stored);
    expect(queryClient.getQueryState(KEY)?.dataUpdatedAt).toBe(1);
    expect(queryClient.getQueryState(KEY)?.isInvalidated).toBe(false);
    expect(getVacationResponse).not.toHaveBeenCalled();
  });

  it("reads the reply back after a save succeeds", async () => {
    const { queryClient, setVacationResponse, observer } = setup(async () => undefined);

    await observer.mutate(update);

    expect(setVacationResponse).toHaveBeenCalledWith("synthetic-session", update);
    expect(queryClient.getQueryState(KEY)?.isInvalidated).toBe(true);
  });

  it("loads through the connection and refuses to load or save before mail is ready", async () => {
    const { queryClient, getVacationResponse } = setup(async () => undefined);
    const connection = { client: { getVacationResponse, setVacationResponse: async () => undefined }, session: "synthetic-session" };
    await expect(queryClient.fetchQuery({ ...vacationResponseQueryOptions(KEY, connection), staleTime: 0 })).resolves.toEqual(stored);
    expect(getVacationResponse).toHaveBeenCalledWith("synthetic-session");
    await expect(queryClient.fetchQuery(vacationResponseQueryOptions(["other"], null))).rejects.toThrow("Mail is not ready yet.");
    const observer = new MutationObserver(queryClient, saveVacationResponseMutationOptions(KEY, null, queryClient));
    await expect(observer.mutate(update)).rejects.toThrow("Mail is not ready yet.");
  });
});
