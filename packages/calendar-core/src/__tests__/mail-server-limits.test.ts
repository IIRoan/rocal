import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_MAX_BLOB_UPLOAD_BYTES,
  DEFAULT_MAX_ATTACHMENT_BYTES,
  formatAttachmentByteLimit,
  parseStalwartSizeBytes,
  resolveMailServerLimits,
  resolveMaxOutgoingAttachmentBytes,
} from "../../src/mail-server-limits";

describe("parseStalwartSizeBytes", () => {
  it("accepts positive integers", () => {
    expect(parseStalwartSizeBytes(100_000_000)).toBe(100_000_000);
  });

  it("parses Stalwart size strings", () => {
    expect(parseStalwartSizeBytes("100mb")).toBe(100 * 1_000_000);
    expect(parseStalwartSizeBytes("50MB")).toBe(50 * 1_000_000);
    expect(parseStalwartSizeBytes("1gb")).toBe(1_000_000_000);
  });

  it("returns null for invalid values", () => {
    expect(parseStalwartSizeBytes(0)).toBeNull();
    expect(parseStalwartSizeBytes(-1)).toBeNull();
    expect(parseStalwartSizeBytes("")).toBeNull();
    expect(parseStalwartSizeBytes("nope")).toBeNull();
    expect(parseStalwartSizeBytes(null)).toBeNull();
  });
});

describe("resolveMailServerLimits", () => {
  it("uses JMAP session maxSizeUpload as the blob upload limit", () => {
    expect(
      resolveMailServerLimits({
        session: {
          capabilities: {
            "urn:ietf:params:jmap:core": { maxSizeUpload: 100_000_000 },
          },
        },
      }),
    ).toMatchObject({
      maxBlobUploadBytes: 100_000_000,
      maxAttachmentSizeBytes: null,
      maxOutgoingAttachmentBytes: 100_000_000,
    });
  });

  it("caps outgoing attachments by the Email singleton maxAttachmentSize", () => {
    expect(
      resolveMailServerLimits({
        session: {
          capabilities: {
            "urn:ietf:params:jmap:core": { maxSizeUpload: 100_000_000 },
          },
        },
        emailSettings: { maxAttachmentSize: 50_000_000 },
      }),
    ).toMatchObject({
      maxBlobUploadBytes: 100_000_000,
      maxAttachmentSizeBytes: 50_000_000,
      maxOutgoingAttachmentBytes: 50_000_000,
    });
  });

  it("uses Jmap singleton maxUploadSize when the session omits maxSizeUpload", () => {
    expect(
      resolveMailServerLimits({
        session: { capabilities: {} },
        jmapSettings: { maxUploadSize: 75_000_000 },
      }),
    ).toMatchObject({
      maxBlobUploadBytes: 75_000_000,
      maxAttachmentSizeBytes: null,
      maxOutgoingAttachmentBytes: 75_000_000,
    });
  });

  it("merges backend-provided limits as a fallback", () => {
    expect(
      resolveMailServerLimits({
        configLimits: {
          maxBlobUploadBytes: 80_000_000,
          maxAttachmentSizeBytes: 60_000_000,
          maxMessageSizeBytes: 90_000_000,
        },
      }),
    ).toEqual({
      maxBlobUploadBytes: 80_000_000,
      maxAttachmentSizeBytes: 60_000_000,
      maxMessageSizeBytes: 90_000_000,
      maxOutgoingAttachmentBytes: 60_000_000,
    });
  });

  it("falls back to Stalwart defaults when no sources are available", () => {
    expect(resolveMailServerLimits({})).toEqual({
      maxBlobUploadBytes: DEFAULT_MAX_BLOB_UPLOAD_BYTES,
      maxAttachmentSizeBytes: DEFAULT_MAX_ATTACHMENT_BYTES,
      maxMessageSizeBytes: null,
      maxOutgoingAttachmentBytes: DEFAULT_MAX_ATTACHMENT_BYTES,
    });
  });

  it("keeps attachment size unknown when only blob upload limits are known", () => {
    expect(
      resolveMailServerLimits({
        configLimits: {
          maxBlobUploadBytes: 80_000_000,
          maxAttachmentSizeBytes: null,
          maxMessageSizeBytes: null,
        },
      }),
    ).toMatchObject({
      maxBlobUploadBytes: 80_000_000,
      maxAttachmentSizeBytes: null,
      maxOutgoingAttachmentBytes: 80_000_000,
    });
  });

  it("exposes maxMessageSize from Email settings", () => {
    expect(
      resolveMailServerLimits({
        emailSettings: {
          maxAttachmentSize: 40_000_000,
          maxMessageSize: 75_000_000,
        },
      }),
    ).toMatchObject({
      maxAttachmentSizeBytes: 40_000_000,
      maxMessageSizeBytes: 75_000_000,
      maxOutgoingAttachmentBytes: 40_000_000,
    });
  });
});

describe("resolveMaxOutgoingAttachmentBytes", () => {
  it("returns the effective outgoing attachment limit", () => {
    expect(
      resolveMaxOutgoingAttachmentBytes({
        session: {
          capabilities: {
            "urn:ietf:params:jmap:core": { maxSizeUpload: 100 * 1024 * 1024 },
          },
        },
        emailSettings: { maxAttachmentSize: 100 * 1024 * 1024 },
      }),
    ).toBe(100 * 1024 * 1024);
  });
});

describe("formatAttachmentByteLimit", () => {
  it("formats common byte limits for user-facing errors", () => {
    expect(formatAttachmentByteLimit(50_000_000)).toBe("50 MB");
    expect(formatAttachmentByteLimit(100 * 1024 * 1024)).toBe("100 MB");
  });
});
