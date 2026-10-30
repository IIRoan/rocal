import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prepareStoreRelease } from "./native-store-release";

const [command, ...args] = process.argv.slice(2);
const read = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const write = (path: string, value: unknown) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
if (command === "prepare") {
  const [app, profile, configPath, directory] = args;
  if (!app || !profile || !configPath || !directory)
    throw new Error("Expected app, profile, EAS config and output directory");
  const { release, draft } = prepareStoreRelease(
    read(configPath),
    app,
    profile,
    read("eas.json"),
  );
  mkdirSync(directory, { recursive: true });
  write(join(directory, "release.json"), release);
  write(join(directory, "store.config.draft.json"), draft);
} else {
  throw new Error("Choose prepare");
}
