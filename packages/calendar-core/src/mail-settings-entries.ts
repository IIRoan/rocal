import type { z } from "./zod";

/** Invalid entries are dropped one at a time, so one bad entry never hides the rest. */
export function normalizeEntries<T>(
  input: unknown,
  schema: z.ZodType<T>,
  key: (entry: T) => string,
  limit: number,
): T[] {
  if (!Array.isArray(input)) return [];
  const entries: T[] = [];
  const keys = new Set<string>();
  for (const entry of input) {
    const parsed = schema.safeParse(entry);
    if (!parsed.success || keys.has(key(parsed.data))) continue;
    keys.add(key(parsed.data));
    entries.push(parsed.data);
    if (entries.length === limit) break;
  }
  return entries;
}

/** A template's or signature's text on one line, for list rows. */
export function entryPreview(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function encodedSize(entries: readonly unknown[]): number {
  return new TextEncoder().encode(JSON.stringify(entries)).length;
}

/** The inline error for a saved template's or signature's name, or null when it is fine. */
export function entryNameError(
  rawName: string,
  entries: readonly { id: string; name: string }[],
  editingId: string | null,
  noun: "template" | "signature",
  maxLength: number,
): string | null {
  const name = rawName.trim();
  if (!name) return `Give the ${noun} a name.`;
  if (name.length > maxLength) return `Use ${maxLength} characters or fewer.`;
  const lower = name.toLowerCase();
  if (entries.some((entry) => entry.id !== editingId && entry.name.toLowerCase() === lower)) {
    return `You already have a ${noun} with this name.`;
  }
  return null;
}
