import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { prepareStoreRelease, selectStoreBuild } from "./native-store-release";

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
} else if (command === "reference") {
  const [buildPath, directory, commit] = args;
  if (!buildPath || !directory || !commit)
    throw new Error("Expected EAS build, output directory and source commit");
  const reference = selectStoreBuild(
    read(buildPath),
    read(join(directory, "release.json")),
    commit,
  );
  write(join(directory, "build-reference.json"), reference);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `build_id=${reference.id}\n`);
} else {
  throw new Error("Choose prepare or reference");
}
