/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import {
  MailReaderLayer,
  useMailReaderDrawer,
} from "../../components/mail/mail-app/mail-reader-layer";

jest.mock("lucide-react", () => ({ Loader2: () => null }));

let slides: Array<{ finish: () => void }> = [];

function fakeAnimate(): Animation {
  const listeners: Array<() => void> = [];
  slides.push({ finish: () => listeners.forEach((listener) => listener()) });
  // The drawer only pauses, plays, cancels and listens for "finish".
  return {
    playState: "running",
    pause() {},
    play() {},
    cancel() {},
    addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.splice(listeners.indexOf(listener), 1),
  } as unknown as Animation;
}

function Reader({ openKey, ready }: { openKey: string | null; ready: boolean }) {
  const drawer = useMailReaderDrawer(openKey, ready);
  return (
    <div>
      {drawer.showEmpty ? <p>Empty reader</p> : null}
      {drawer.layers.map(({ key, revealed, slideIn, leaving }) => (
        <MailReaderLayer
          key={key}
          revealed={revealed}
          slideIn={slideIn}
          leaving={leaving}
          onEntered={() => drawer.finishEnter(key)}
          onLeft={drawer.finishLeave}
        >
          {key === openKey ? <p>Conversation {key}</p> : undefined}
        </MailReaderLayer>
      ))}
    </div>
  );
}

describe("mail reader drawer", () => {
  let container: HTMLDivElement;
  let root: Root;
  const render = (openKey: string | null, ready: boolean) =>
    act(() => root.render(<Reader openKey={openKey} ready={ready} />));
  const layers = () => Array.from(container.querySelectorAll("[data-mail-reader-content]"));

  beforeEach(() => {
    slides = [];
    Object.defineProperty(HTMLElement.prototype, "animate", { value: fakeAnimate, configurable: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  });

  it("slides in from the empty reader, swaps conversations in place and slides off on close", () => {
    render("a", false);
    expect(slides).toHaveLength(0);
    expect(layers()[0]?.hasAttribute("inert")).toBe(true);
    expect(container.textContent).toContain("Empty reader");

    render("a", true);
    expect(slides).toHaveLength(1);
    act(() => slides[0]?.finish());
    expect(container.textContent).not.toContain("Empty reader");

    render("b", false);
    expect(container.textContent).toContain("Conversation a");
    render("b", true);
    expect(slides).toHaveLength(1);
    expect(layers()).toHaveLength(1);
    expect(container.textContent).toContain("Conversation b");
    expect(layers()[0]?.hasAttribute("inert")).toBe(false);

    render(null, false);
    expect(slides).toHaveLength(2);
    expect(container.textContent).toContain("Empty reader");
    act(() => slides[1]?.finish());
    expect(layers()).toHaveLength(0);
  });
});
