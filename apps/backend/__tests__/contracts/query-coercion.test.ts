import { describe, expect, it } from "@jest/globals";
import {
  eventSearchCorpusQuerySchema,
  eventSearchQuerySchema,
  invitationByExternalIdQuerySchema,
} from "../../contracts/event.contract";
import { deleteSubscriptionQuerySchema } from "../../contracts/subscription.contract";
import { optionalShareLinkBodySchema } from "../../contracts/calendar.contract";
import {
  optionalQueryBooleanSchema,
  optionalQueryInt,
} from "../../contracts/_zod";

describe("query coercion helpers", () => {
  it("coerces string query integers for event search pagination", () => {
    expect(
      eventSearchQuerySchema.parse({
        q: "meeting",
        limit: "10",
        offset: "0",
      }),
    ).toEqual({
      q: "meeting",
      limit: 10,
      offset: 0,
    });
  });

  it("coerces string query integers for search corpus pagination", () => {
    expect(
      eventSearchCorpusQuerySchema.parse({
        limit: "25",
        offset: "5",
      }),
    ).toEqual({
      limit: 25,
      offset: 5,
    });
  });

  it("coerces syncRemote=false from query strings", () => {
    expect(
      invitationByExternalIdQuerySchema.parse({
        externalId: "uid-123@example.com",
        syncRemote: "false",
      }),
    ).toEqual({
      externalId: "uid-123@example.com",
      syncRemote: false,
    });
  });

  it("treats omitted syncRemote as undefined", () => {
    expect(
      invitationByExternalIdQuerySchema.parse({
        externalId: "uid-123@example.com",
      }),
    ).toEqual({
      externalId: "uid-123@example.com",
    });
  });

  it("coerces deleteEvents=true from subscription delete queries", () => {
    expect(deleteSubscriptionQuerySchema.parse({ deleteEvents: "true" })).toEqual(
      { deleteEvents: true },
    );
  });

  it("rejects invalid query integers", () => {
    expect(() =>
      optionalQueryInt({ min: 1, max: 50 }).parse("not-a-number"),
    ).toThrow();
  });

  it("rejects invalid query booleans", () => {
    expect(() => optionalQueryBooleanSchema.parse("maybe")).toThrow();
  });
});

describe("optionalShareLinkBodySchema", () => {
  it("accepts a missing body", () => {
    expect(optionalShareLinkBodySchema.parse(undefined)).toEqual({});
  });

  it("accepts an empty object body", () => {
    expect(optionalShareLinkBodySchema.parse({})).toEqual({});
  });
});
