/** @jest-environment jsdom */

import {
  MOTION_PENDING_ATTRIBUTE,
  holdUntilPainted,
  moveFrom,
  playAfterPaint,
  revealSequence,
  slideFadeIn,
} from "./motion";

const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));

function fakeAnimation() {
  const animation = Object.assign(new EventTarget(), {
    playState: "running" as AnimationPlayState,
    pause: jest.fn(() => {
      animation.playState = "paused";
    }),
    play: jest.fn(() => {
      animation.playState = "running";
    }),
    cancel: jest.fn(() => {
      animation.playState = "idle";
      animation.dispatchEvent(new Event("cancel"));
    }),
  });
  return animation;
}

type AnimateCall = [Keyframe[], KeyframeAnimationOptions];
let animate: jest.Mock<Animation, AnimateCall>;
let reducedMotion = false;

beforeEach(() => {
  reducedMotion = false;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: reducedMotion }),
  });
  animate = jest.fn<Animation, AnimateCall>(
    () => fakeAnimation() as Partial<Animation> as Animation,
  );
  // jsdom has no WAAPI; the stub records what each helper asks the compositor to run.
  HTMLElement.prototype.animate = animate as unknown as HTMLElement["animate"];
});

function firstAnimateCall(): AnimateCall {
  const call = animate.mock.calls[0];
  if (!call) throw new Error("animate was not called");
  return call;
}

afterEach(() => {
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

describe("playAfterPaint", () => {
  it("holds the first keyframe until two frames have painted", async () => {
    const animation = fakeAnimation();
    playAfterPaint(animation as Partial<Animation> as Animation);
    expect(animation.playState).toBe("paused");

    await nextFrame();
    expect(animation.play).not.toHaveBeenCalled();

    await nextFrame();
    expect(animation.play).toHaveBeenCalledTimes(1);
  });

  it("drops the wait when the entrance is cancelled before it starts", async () => {
    const animation = fakeAnimation();
    playAfterPaint(animation as Partial<Animation> as Animation);
    animation.cancel();

    await nextFrame();
    await nextFrame();
    expect(animation.play).not.toHaveBeenCalled();
    expect(animation.playState).toBe("idle");
  });

  it("skips to the end state when the guard fails once painted", async () => {
    const animation = fakeAnimation();
    let canPlay = true;
    playAfterPaint(animation as Partial<Animation> as Animation, () => canPlay);
    canPlay = false;

    await nextFrame();
    await nextFrame();
    expect(animation.play).not.toHaveBeenCalled();
    expect(animation.playState).toBe("idle");
  });

  it("does not wait under reduced motion", () => {
    reducedMotion = true;
    const animation = fakeAnimation();
    playAfterPaint(animation as Partial<Animation> as Animation);
    expect(animation.pause).not.toHaveBeenCalled();
  });
});

describe("holdUntilPainted", () => {
  it("pauses a CSS entrance until painted, or until released for a close", async () => {
    const held = document.createElement("div");
    holdUntilPainted(held);
    expect(held.hasAttribute(MOTION_PENDING_ATTRIBUTE)).toBe(true);
    await nextFrame();
    expect(held.hasAttribute(MOTION_PENDING_ATTRIBUTE)).toBe(true);
    await nextFrame();
    expect(held.hasAttribute(MOTION_PENDING_ATTRIBUTE)).toBe(false);

    const closing = document.createElement("div");
    holdUntilPainted(closing)();
    expect(closing.hasAttribute(MOTION_PENDING_ATTRIBUTE)).toBe(false);
  });
});

describe("slideFadeIn", () => {
  it("ends on the element's own inline opacity instead of snapping to it afterwards", () => {
    const preview = document.createElement("div");
    preview.style.opacity = "0.85";
    slideFadeIn(preview, null, { duration: 200 });

    const [keyframes] = firstAnimateCall();
    expect(keyframes[0]).toMatchObject({ opacity: 0 });
    expect(keyframes[1]).toMatchObject({ opacity: "0.85" });
  });

  it("reveals an element pre-hidden with inline opacity 0 and keeps it shown after the fade", () => {
    const hidden = document.createElement("div");
    hidden.style.opacity = "0";
    slideFadeIn(hidden, null, { duration: 200 });

    const [keyframes] = firstAnimateCall();
    expect(keyframes[1]).toMatchObject({ opacity: 1 });
    expect(hidden.style.opacity).toBe("");
  });

  it("keeps a delayed entrance hidden until its delay ends", () => {
    slideFadeIn(document.createElement("div"), { y: 8 }, { duration: 200, delay: 90 });

    const [, options] = firstAnimateCall();
    expect(options).toMatchObject({ delay: 90, fill: "backwards" });
  });
});

describe("revealSequence", () => {
  it("staggers each step's matches from the step's delay and cancels them together", () => {
    const root = document.createElement("div");
    root.innerHTML = '<p data-a></p><p data-b></p><p data-b></p>';
    const cancel = revealSequence(root, [
      { selector: "[data-a]", offset: null, duration: 100 },
      { selector: "[data-b]", offset: { y: 8 }, duration: 100, delay: 50, stagger: 20 },
    ]);

    expect(animate.mock.calls.map(([, options]) => options.delay)).toEqual([0, 50, 70]);
    cancel();
    for (const result of animate.mock.results) {
      expect((result.value as Animation).playState).toBe("idle");
    }
  });
});

describe("moveFrom", () => {
  it("animates only transform from the previous spot to the laid-out one", () => {
    moveFrom(document.createElement("div"), { x: 12, y: -4 }, { duration: 220 });

    const [keyframes] = firstAnimateCall();
    expect(keyframes).toEqual([
      { transform: "translate(12px, -4px) scale(1)" },
      { transform: "none" },
    ]);
  });
});
