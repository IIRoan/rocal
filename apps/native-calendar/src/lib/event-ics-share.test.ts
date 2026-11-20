import type { CalendarEvent } from "@workspace/calendar-core";
import * as Sharing from "expo-sharing";
import { clearIcsExportCache, shareEventIcs, shareIcsFile } from "./event-ics-share";

interface MockFile {
  uri: string;
  name: string;
  exists: boolean;
  content: string;
  create: () => void;
}

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));
jest.mock("@workspace/logger", () => ({
  createLogger: () => ({ warn: jest.fn() }),
}));
jest.mock("expo-file-system", () => {
  const created: MockFile[] = [];
  const looseFiles: MockFile[] = [];
  const directoryLog: string[] = [];
  const directories = new Set<string>();
  const write = jest.fn<Promise<void>, [MockFile, string]>();
  class File implements MockFile {
    uri: string;
    name: string;
    exists = false;
    content = "";
    constructor(directory: { uri: string }, name: string) {
      this.uri = `${directory.uri}/${name}`;
      this.name = name;
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
  class Directory {
    uri: string;
    constructor(parent: { uri: string }, name: string) {
      this.uri = `${parent.uri}/${name}`;
    }
    get exists() {
      return directories.has(this.uri);
    }
    create() {
      directories.add(this.uri);
      directoryLog.push(`create ${this.uri}`);
    }
    delete() {
      directories.delete(this.uri);
      directoryLog.push(`delete ${this.uri}`);
    }
  }
  const cache = { uri: "file:///cache", list: jest.fn(() => looseFiles) };
  return { File, Directory, Paths: { cache }, created, directories, directoryLog, looseFiles, write };
});
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

const fileSystem = jest.requireMock<{
  File: new (directory: { uri: string }, name: string) => MockFile;
  Paths: { cache: { list: jest.Mock } };
  created: MockFile[];
  directories: Set<string>;
  directoryLog: string[];
  looseFiles: MockFile[];
  write: jest.Mock<Promise<void>, [MockFile, string]>;
}>("expo-file-system");
const { created: files, directories, directoryLog, looseFiles, write } = fileSystem;
const EXPORT_DIRECTORY = "file:///cache/ics-export";
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

    expect(shareAsync).toHaveBeenCalledWith("file:///cache/ics-export/dentist.ics", {
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

describe("shareIcsFile", () => {
  beforeEach(() => {
    files.length = 0;
    directories.clear();
    directoryLog.length = 0;
    write.mockReset().mockResolvedValue(undefined);
    isAvailableAsync.mockReset().mockResolvedValue(true);
    shareAsync.mockReset().mockResolvedValue(undefined);
  });

  it("wipes what an earlier share left, then writes only inside the export folder and deletes after sharing", async () => {
    directories.add(EXPORT_DIRECTORY);

    await shareIcsFile({ icsContent: "BEGIN:VCALENDAR", filename: "work.ics" });

    expect(directoryLog).toEqual([`delete ${EXPORT_DIRECTORY}`, `create ${EXPORT_DIRECTORY}`]);
    expect(shareAsync).toHaveBeenCalledWith(`${EXPORT_DIRECTORY}/work.ics`, expect.anything());
    expect(files[0]?.exists).toBe(false);
  });
});

describe("clearIcsExportCache", () => {
  beforeEach(() => {
    files.length = 0;
    directories.clear();
    looseFiles.length = 0;
  });

  it("removes the export folder and the loose .ics files earlier builds left in the cache root", async () => {
    directories.add(EXPORT_DIRECTORY);
    const leftover = new fileSystem.File({ uri: "file:///cache" }, "dentist.ics");
    const unrelated = new fileSystem.File({ uri: "file:///cache" }, "avatar.jpg");
    leftover.create();
    unrelated.create();
    looseFiles.push(leftover, unrelated);

    await clearIcsExportCache();

    expect(directories.has(EXPORT_DIRECTORY)).toBe(false);
    expect(leftover.exists).toBe(false);
    expect(unrelated.exists).toBe(true);
  });

  it("never rejects, so launch and sign-out are not blocked", async () => {
    fileSystem.Paths.cache.list.mockImplementationOnce(() => {
      throw new Error("io");
    });

    await expect(clearIcsExportCache()).resolves.toBeUndefined();
  });
});
