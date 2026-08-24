import {
  normalizeSolaceProfileLookupEmails,
  SOLACE_PROFILE_LOOKUP_MAX_EMAILS,
  type SolaceProfileLookupResponse,
} from "@workspace/calendar-core";

const LOOKUP_FLUSH_MS = 24;

type ProfileLookupWaiter = {
  resolve: (image: string | null) => void;
  reject: (error: unknown) => void;
};

export function createSolaceProfileLookupBatcher(
  lookup: (emails: string[]) => Promise<SolaceProfileLookupResponse>,
) {
  let queue = new Map<string, ProfileLookupWaiter[]>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const pending = queue;
    queue = new Map();
    if (pending.size === 0) {
      return;
    }

    const emails = [...pending.keys()];
    const chunks: string[][] = [];
    for (let index = 0; index < emails.length; index += SOLACE_PROFILE_LOOKUP_MAX_EMAILS) {
      chunks.push(emails.slice(index, index + SOLACE_PROFILE_LOOKUP_MAX_EMAILS));
    }

    void (async () => {
      try {
        const images = new Map<string, string>();
        for (const chunk of chunks) {
          const response = await lookup(chunk);
          for (const profile of response.profiles) {
            images.set(profile.email, profile.image);
          }
        }

        for (const [email, waiters] of pending) {
          const image = images.get(email) ?? null;
          for (const waiter of waiters) {
            waiter.resolve(image);
          }
        }
      } catch (error) {
        for (const waiters of pending.values()) {
          for (const waiter of waiters) {
            waiter.reject(error);
          }
        }
      }
    })();
  };

  return {
    get(email: string): Promise<string | null> {
      const normalized = normalizeSolaceProfileLookupEmails([email])[0];
      if (!normalized) {
        return Promise.resolve(null);
      }

      return new Promise((resolve, reject) => {
        const waiters = queue.get(normalized);
        if (waiters) {
          waiters.push({ resolve, reject });
        } else {
          queue.set(normalized, [{ resolve, reject }]);
        }

        if (!timer) {
          timer = setTimeout(flush, LOOKUP_FLUSH_MS);
        }
      });
    },
  };
}
