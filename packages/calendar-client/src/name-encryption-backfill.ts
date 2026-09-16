import {
  isCalendarNameBackfillCandidate,
  isCategoryNameBackfillCandidate,
  type Calendar,
  type CalendarsResponse,
  type CategoriesResponse,
  type EventCategory,
} from "@workspace/calendar-core";
import type { E2eeProvider } from "./e2ee-provider";
import type { HttpClient } from "./http-client";

export const NAME_BACKFILL_BATCH_SIZE = 5;

export type NameEncryptionBackfillResult = {
  calendars: number;
  categories: number;
  failed: number;
};

type BackfillInput = {
  client: Pick<HttpClient, "get" | "put">;
  e2ee: E2eeProvider;
  batchSize?: number;
};

type BackfillTarget = {
  path: string;
  encrypt: () => Promise<{ name?: string; encryptedName?: string }>;
};

async function runInBatches(
  targets: BackfillTarget[],
  client: BackfillInput["client"],
  batchSize: number,
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  for (let index = 0; index < targets.length; index += batchSize) {
    const outcomes = await Promise.all(
      targets.slice(index, index + batchSize).map(async (target) => {
        try {
          const payload = await target.encrypt();
          // Never upload a body that still carries plaintext (session lost mid-run).
          if (!payload.encryptedName || payload.name !== undefined) {
            return false;
          }
          await client.put(target.path, payload);
          return true;
        } catch {
          return false;
        }
      }),
    );

    for (const ok of outcomes) {
      if (ok) succeeded += 1;
      else failed += 1;
    }
  }

  return { succeeded, failed };
}

/** Idempotent: the server blanks plaintext once ciphertext is stored; failures retry next launch. */
export async function backfillEncryptedNames({
  client,
  e2ee,
  batchSize = NAME_BACKFILL_BATCH_SIZE,
}: BackfillInput): Promise<NameEncryptionBackfillResult> {
  const empty: NameEncryptionBackfillResult = {
    calendars: 0,
    categories: 0,
    failed: 0,
  };

  try {
    if (!(await e2ee.hasActiveSession())) {
      return empty;
    }

    const [calendarsResponse, categoriesResponse] = await Promise.all([
      client.get<CalendarsResponse>("/api/calendars"),
      client.get<CategoriesResponse>("/api/categories"),
    ]);

    const calendarTargets = (calendarsResponse.calendars ?? [])
      .filter((calendar: Calendar) => isCalendarNameBackfillCandidate(calendar))
      .map(
        (calendar): BackfillTarget => ({
          path: `/api/calendars/${encodeURIComponent(calendar.id)}`,
          encrypt: () =>
            e2ee.attachCalendarEncryptionShadow({ name: calendar.name }),
        }),
      );
    const categoryTargets = (categoriesResponse.categories ?? [])
      .filter((category: EventCategory) =>
        isCategoryNameBackfillCandidate(category),
      )
      .map(
        (category): BackfillTarget => ({
          path: `/api/categories/${encodeURIComponent(category.id)}`,
          encrypt: () =>
            e2ee.attachCategoryEncryptionShadow({ name: category.name }),
        }),
      );

    const calendars = await runInBatches(calendarTargets, client, batchSize);
    const categories = await runInBatches(categoryTargets, client, batchSize);

    return {
      calendars: calendars.succeeded,
      categories: categories.succeeded,
      failed: calendars.failed + categories.failed,
    };
  } catch {
    return empty;
  }
}
