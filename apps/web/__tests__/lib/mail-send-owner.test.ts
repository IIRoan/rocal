import { afterEach, expect, it } from "@jest/globals";
import { getMailSendAttemptStore } from "@workspace/calendar-core";
import { clearActiveE2eeSession, setActiveE2eeSession, type ActiveE2eeSession } from "@/lib/e2ee-session";

afterEach(() => clearActiveE2eeSession());

it("clears the old Mail send store on a global account switch even when Mail is unmounted", async () => {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const owner: ActiveE2eeSession = { userId: "owner-one", deviceId: "device", accountKey: key, blindIndexKey: key, activatedAt: new Date() };
  setActiveE2eeSession(owner);
  const previous = getMailSendAttemptStore("mail-account").get("pending-scope", "owner@solace.test");
  setActiveE2eeSession({ ...owner, activatedAt: new Date() });
  expect(getMailSendAttemptStore("mail-account").get("pending-scope", "owner@solace.test")).toBe(previous);
  setActiveE2eeSession({ ...owner, userId: "owner-two" });
  expect(previous.cancelled).toBe(true);
  const next = getMailSendAttemptStore("mail-account").get("pending-scope", "owner@solace.test");
  expect(next).not.toBe(previous);
  clearActiveE2eeSession();
  expect(next.cancelled).toBe(true);
});
