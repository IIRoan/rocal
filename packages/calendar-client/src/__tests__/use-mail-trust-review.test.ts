/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it } from "@jest/globals";
import {
  createMailTrustReviewBridge,
  type MailTrustReviewAction,
} from "@workspace/calendar-core/mail-key-continuity";
import { useMailTrustReview } from "../use-mail-trust-review";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let bridge: ReturnType<typeof createMailTrustReviewBridge>;
let root: Root;
let container: HTMLDivElement;
let latest: ReturnType<typeof useMailTrustReview> | null = null;
function Probe({ accountId }: { accountId: string }) {
  const review = useMailTrustReview(bridge, accountId);
  latest = review;
  return React.createElement("p", null, review.problem?.kind ?? "none");
}
function current() {
  if (!latest) throw new Error("Review not rendered");
  return latest;
}
beforeEach(() => {
  bridge = createMailTrustReviewBridge();
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(React.createElement(Probe, { accountId: "user-a" })));
});
afterEach(() => act(() => root.unmount()));
it("cancels pending approval and clears visible history on account switch", async () => {
  let result: Promise<MailTrustReviewAction> | undefined;
  act(() => {
    result = bridge.request({
      kind: "changed",
      oldFingerprint: "A",
      newFingerprint: "B",
    });
  });
  expect(container.textContent).toBe("changed");
  act(() => root.render(React.createElement(Probe, { accountId: "user-b" })));
  await expect(result).resolves.toBe("cancel");
  expect(container.textContent).toBe("none");
});
it("cancels a mounted review synchronously when its session closes", async () => {
  let result: Promise<MailTrustReviewAction> | undefined;
  act(() => {
    result = bridge.request({ kind: "missing" });
  });
  act(() => bridge.cancel());
  await expect(result).resolves.toBe("cancel");
  expect(container.textContent).toBe("none");
});
it("never lets an old dialog handler approve a replacement review that has not rendered yet", async () => {
  let first: Promise<MailTrustReviewAction> | undefined;
  let second: Promise<MailTrustReviewAction> | undefined;
  let secondAction: MailTrustReviewAction | undefined;
  act(() => {
    first = bridge.request({
      kind: "changed",
      oldFingerprint: "A",
      newFingerprint: "B",
    });
  });
  const oldSettle = current().settle;
  act(() => {
    second = bridge.request({
      kind: "changed",
      oldFingerprint: "A",
      newFingerprint: "C",
    });
    oldSettle("approve");
    second
      .then((value) => {
        secondAction = value;
      })
      .catch(() => undefined);
  });
  await expect(first).resolves.toBe("cancel");
  expect(secondAction).toBeUndefined();
  act(() => current().settle("approve"));
  await expect(second).resolves.toBe("approve");
});
