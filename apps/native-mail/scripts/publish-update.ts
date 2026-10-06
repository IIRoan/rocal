#!/usr/bin/env bun
import { resolve } from "node:path";
import { publishNativeUpdate } from "../../../scripts/native-publish-update";

await publishNativeUpdate(resolve(import.meta.dir, ".."));
