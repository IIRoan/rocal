"use client";

import type { SectionMessage } from "./account-settings-types";

const MESSAGE_CLASS = "mx-2 my-1 rounded-lg px-3 py-2 text-[13px]";

/** Stays mounted so the status region exists before a success message is written into it. */
export function InlineMessage({ msg }: { msg: SectionMessage }) {
  return (
    <>
      <div role="status">
        {msg?.kind === "success" ? (
          <div className={`${MESSAGE_CLASS} bg-secondary/10 text-secondary-foreground`}>
            {msg.text}
          </div>
        ) : null}
      </div>
      {msg?.kind === "error" ? (
        <div
          role="alert"
          className={`${MESSAGE_CLASS} bg-destructive/10 text-destructive`}
        >
          {msg.text}
        </div>
      ) : null}
    </>
  );
}
