import type { CalendarEvent } from "@workspace/calendar-core";
import * as Sharing from "expo-sharing";
import { shareEventIcs } from "./event-ics-share";

interface MockFile {
  uri: string;
  exists: boolean;
  content: string;
}

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));
jest.mock("expo-file-system", () => {
  const created: MockFile[] = [];
  const write = jest.fn<Promise<void>, [MockFile, string]>();
  class File implements MockFile {
    uri: string;
    exists = false;
    content = "";
    constructor(directory: { uri: string }, name: string) {
      this.uri = `${directory.uri}/${name}`;
      created.push(this);
    }
    create() {
      this.exists = true;
    }
    write(content: string) {
      return write(this, content);
    }
    delete() {
      this.exists = false;
    }
  }
  return { File, Paths: { cache: { uri: "file:///cache" } }, created, write };
});
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

const { created: files, write } = jest.requireMock<{
  created: MockFile[];
  write: jest.Mock<Promise<void>, [MockFile, string]>;
}>("expo-file-system");
const isAvailableAsync = Sharing.isAvailableAsync as jest.Mock;
const shareAsync = Sharing.shareAsync as jest.Mock;

const event: CalendarEvent = {
  id: "evt-1",
  title: "Dentist",
  start: new Date("2025-06-16T07:00:00.000Z"),
  end: new Date("2025-06-16T08:00:00.000Z"),
  timezone: "Europe/Amsterdam",
  calendarId: "cal-1",
  userId: "user-1",
  createdAt: new Date("2025-06-01T00:00:00.000Z"),
  updatedAt: new Date("2025-06-01T00:00:00.000Z"),
};

describe("shareEventIcs", () => {
  beforeEach(() => {
    files.length = 0;
    write.mockReset().mockImplementation(async (file, content) => {
      file.content = content;
    });
    isAvailableAsync.mockReset().mockResolvedValue(true);
    shareAsync.mockReset();
  });

  it("shares the on-device .ics as a calendar file", async () => {
    shareAsync.mockImplementation(async () => {
      expect(files[0]?.exists).toBe(true);
      expect(files[0]?.content).toContain("SUMMARY:Dentist");
    });

    await shareEventIcs(event, { calendarName: "Personal" });

    expect(shareAsync).toHaveBeenCalledWith("file:///cache/dentist.ics", {
      mimeType: "text/calendar",
      dialogTitle: "dentist.ics",
      UTI: "com.apple.ical.ics",
    });
  });

  it("deletes the plaintext temp file after sharing", async () => {
    shareAsync.mockResolvedValue(undefined);
    await shareEventIcs(event);
    expect(files).toHaveLength(1);
    expect(files[0]?.exists).toBe(false);
  });

  it("waits for the file write before opening the share sheet", async () => {
    let finishWrite: (() => void) | undefined;
    write.mockImplementation(
      (file, content) =>
        new Promise<void>((resolve) => {
          finishWrite = () => {
            file.content = content;
            resolve();
          };
        }),
    );

    const sharing = shareEventIcs(event);
    await Promise.resolve();

    expect(write).toHaveBeenCalledTimes(1);
    expect(shareAsync).not.toHaveBeenCalled();
    expect(files[0]?.exists).toBe(true);
    if (!finishWrite) throw new Error("File write did not start");
    finishWrite();
    await sharing;
    expect(shareAsync).toHaveBeenCalledTimes(1);
    expect(files[0]?.exists).toBe(false);
  });

  it("cleans up a failed file write without opening the share sheet", async () => {
    write.mockRejectedValue(new Error("write failed"));

    await expect(shareEventIcs(event)).rejects.toThrow("write failed");
    expect(shareAsync).not.toHaveBeenCalled();
    expect(files[0]?.exists).toBe(false);
  });

  it("deletes the temp file when the share sheet fails", async () => {
    shareAsync.mockRejectedValue(new Error("share failed"));
    await expect(shareEventIcs(event)).rejects.toThrow("share failed");
    expect(files[0]?.exists).toBe(false);
  });

  it("writes nothing when sharing is unavailable", async () => {
    isAvailableAsync.mockResolvedValue(false);
    await expect(shareEventIcs(event)).rejects.toThrow(
      "Sharing is not available on this device.",
    );
    expect(files).toHaveLength(0);
  });

  it("writes nothing for an event this device could not decrypt", async () => {
    await expect(
      shareEventIcs({
        ...event,
        title: "Encrypted event",
        encryptionState: "encrypted",
      }),
    ).rejects.toThrow("still encrypted");
    expect(files).toHaveLength(0);
    expect(shareAsync).not.toHaveBeenCalled();
  });
});
