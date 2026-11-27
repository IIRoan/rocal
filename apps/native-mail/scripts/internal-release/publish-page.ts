#!/usr/bin/env bun
import { publishPage } from "../../../../scripts/internal-release/publish-page";

if (import.meta.main) await publishPage("mail");
