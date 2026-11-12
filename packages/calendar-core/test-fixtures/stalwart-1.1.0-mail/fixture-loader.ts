import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "../../src/zod";

type FixtureBodyStructure = {
  type?: string;
  blobId?: string;
  name?: string;
  subParts?: FixtureBodyStructure[];
};

const bodyStructure: z.ZodType<FixtureBodyStructure> = z.lazy(() =>
  z.object({
    type: z
      .string()
      .nullish()
      .transform((value) => value ?? undefined),
    blobId: z
      .string()
      .nullish()
      .transform((value) => value ?? undefined),
    name: z
      .string()
      .nullish()
      .transform((value) => value ?? undefined),
    subParts: z.array(bodyStructure).optional(),
  }),
);

const filename = z.string().regex(/^[a-z0-9-]+\.(asc|eml|mime)$/);
const manifestSchema = z.object({
  syntheticOnly: z.literal(true),
  targetVersion: z.literal("1.1.0"),
  targetSourceCommit: z.literal("e7cde9b3fac32d2a254ef782efec56f2373ec5d4"),
  expected: z.object({
    text: z.string(),
    html: z.string(),
    attachmentText: z.string(),
  }),
  keys: z.array(
    z.object({
      name: z.string(),
      email: z.string(),
      publicKeyArmored: z.string(),
      privateKeyArmored: z.string(),
      fingerprint: z.string(),
    }),
  ),
  records: z.array(
    z.object({
      name: z.string(),
      owner: z.string(),
      ciphertext: filename,
      rawMime: filename,
      topContentType: z.string(),
      expectedSignature: z.enum(["verified", "not_signed"]),
      expectedLayers: z.number().int().min(1).max(2),
      usable: z.boolean(),
      message: z.object({
        id: z.string(),
        bodyStructure: bodyStructure.optional(),
      }),
    }),
  ),
  filesSha256: z.record(filename, z.string().regex(/^[a-f0-9]{64}$/)),
});

export function loadStalwart110MailFixtures() {
  const manifest = manifestSchema.parse(
    JSON.parse(readFileSync(join(__dirname, "manifest.json"), "utf8")),
  );
  for (const [name, expected] of Object.entries(manifest.filesSha256)) {
    const actual = createHash("sha256")
      .update(readFileSync(join(__dirname, name)))
      .digest("hex");
    if (actual !== expected)
      throw new Error(`Synthetic target fixture checksum mismatch: ${name}`);
  }
  return {
    ...manifest,
    readCiphertext: (
      record: z.infer<typeof manifestSchema>["records"][number],
    ) => readFileSync(join(__dirname, record.ciphertext), "utf8"),
    keyFor: (name: string) => {
      const key = manifest.keys.find((candidate) => candidate.name === name);
      if (!key) throw new Error(`Synthetic key not found: ${name}`);
      return key;
    },
  };
}
