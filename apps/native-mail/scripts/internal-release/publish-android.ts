#!/usr/bin/env bun
import { publishAndroid } from "../../../../scripts/internal-release/publish-android";

if (import.meta.main) await publishAndroid("mail");
