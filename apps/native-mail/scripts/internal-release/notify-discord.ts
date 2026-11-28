#!/usr/bin/env bun
import { notifyDiscord } from "../../../../scripts/internal-release/notify-discord";

if (import.meta.main) await notifyDiscord();
