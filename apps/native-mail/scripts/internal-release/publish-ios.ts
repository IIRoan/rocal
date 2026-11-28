#!/usr/bin/env bun
import { publishIos } from "../../../../scripts/internal-release/publish-ios";

if (import.meta.main) await publishIos("mail");
