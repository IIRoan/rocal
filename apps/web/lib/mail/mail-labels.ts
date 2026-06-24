import type { JmapEmailMessage, LabelDef } from "./types";

/** Resolve label definitions for keywords present on a message. */
export function getMessageLabels(
  message: JmapEmailMessage,
  labels: LabelDef[],
): LabelDef[] {
  if (!message.keywords) return [];
  const result: LabelDef[] = [];
  for (const label of labels) {
    if (message.keywords[`label:${label.id}`] === true) {
      result.push(label);
    }
  }
  return result;
}

/**
 * Also detect keywords with `label:` prefix that belong to labels
 * not yet known locally (e.g. created on another device).
 */
export function getAllMessageLabels(
  message: JmapEmailMessage,
  knownLabels: LabelDef[],
): LabelDef[] {
  if (!message.keywords) return [];
  const known = getMessageLabels(message, knownLabels);
  const knownIds = new Set(known.map((l) => l.id));

  for (const key of Object.keys(message.keywords)) {
    if (!key.startsWith("label:")) continue;
    const id = key.slice("label:".length);
    if (knownIds.has(id)) continue;
    known.push({ id, name: id, color: "#6b7280" });
  }

  return known;
}
