// ---------------------------------------------------------------------------
// OpenPGP.js Hermes compatibility shim
//
// This module wraps openpgp's browser ESM build (`dist/openpgp.min.mjs`) and
// applies the `Symbol.species` polyfill required to run on React Native's
// Hermes engine (see `openpgp-hermes-patch.ts` for the full explanation).
//
// The bare `openpgp` specifier is redirected to this file in `metro.config.js`,
// so every `import ... from "openpgp"` in the app receives the patched module.
// This file imports the real build via the `openpgp/dist/openpgp.min.mjs` path,
// which does NOT match the bare `openpgp` specifier, so there is no resolution
// loop.
//
// OpenPGP.js 6 reads `globalThis.crypto.subtle` while evaluating the module.
// Import the native installer first so a late route load cannot race it.
// ---------------------------------------------------------------------------
import "../install-native-crypto";
import * as openpgp from "openpgp/dist/openpgp.min.mjs";
import { applyHermesPacketListPatch } from "./openpgp-hermes-patch";

applyHermesPacketListPatch(openpgp.PacketList);

export * from "openpgp/dist/openpgp.min.mjs";
