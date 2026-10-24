/** @jest-environment jsdom */

import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, jest } from "@jest/globals";
import { RichTextEditor } from "../../components/mail/rich-text-editor";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const initialContent = "<p><strong>Saved draft</strong></p>";

function ControlledEditor({
  disabled,
  onChange,
}: {
  disabled: boolean;
  onChange: (html: string) => void;
}) {
  const [content, setContent] = useState(initialContent);
  return (
    <RichTextEditor
      content={content}
      disabled={disabled}
      onChange={(html) => {
        onChange(html);
        setContent(html);
      }}
    />
  );
}

it("restores a controlled draft without emitting empty content while mounting or disabling", async () => {
  const onChange = jest.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  try {
    await act(async () => root.render(
      <ControlledEditor disabled={false} onChange={onChange} />,
    ));
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    });
    expect(container.querySelector(".tiptap")?.innerHTML).toBe(initialContent);
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => root.render(
      <ControlledEditor disabled onChange={onChange} />,
    ));
    expect(container.querySelector(".tiptap")?.innerHTML).toBe(initialContent);
    expect(container.querySelector(".tiptap")?.getAttribute("contenteditable"))
      .toBe("false");
    expect(onChange).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
