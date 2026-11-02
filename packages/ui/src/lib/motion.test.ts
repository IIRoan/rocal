/** @jest-environment jsdom */

import {
  MOTION_PENDING_ATTRIBUTE,
  followPageScroll,
  holdUntilPainted,
  loopMotion,
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

describe("loopMotion", () => {
  it("runs a loading loop forever without waiting for paint", () => {
    const element = document.createElement("div");
    const pulse = [{ opacity: 1 }, { opacity: 0.58 }];
    const animation = loopMotion(element, pulse, { duration: 1200, alternate: true });
    expect(animation?.pause).not.toHaveBeenCalled();
    expect(firstAnimateCall()).toEqual([
      pulse,
      expect.objectContaining({ iterations: Infinity, direction: "alternate" }),
    ]);
  });

  it("leaves the element still under reduced motion", () => {
    reducedMotion = true;
    expect(loopMotion(document.createElement("div"), [], { duration: 2400 })).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });
});

describe("followPageScroll", () => {
  const disconnect = jest.fn();
  let resized: () => void = () => {};
  let stop: () => void = () => {};

  function setPage(scrollHeight: number, scrollY: number) {
    const root = document.documentElement;
    Object.defineProperty(root, "scrollHeight", { configurable: true, value: scrollHeight });
    Object.defineProperty(root, "clientHeight", { configurable: true, value: 1000 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: scrollY });
  }

  /** An image 200px taller than its frame. */
  function follow() {
    const image = document.createElement("div");
    const frame = document.createElement("div");
    Object.defineProperty(image, "offsetHeight", { value: 1200 });
    Object.defineProperty(frame, "clientHeight", { value: 1000 });
    stop = followPageScroll(image, frame);
    return image;
  }

  async function scroll() {
    window.dispatchEvent(new Event("scroll"));
    await nextFrame();
  }

  beforeEach(() => {
    disconnect.mockClear();
    Object.assign(globalThis, {
      ResizeObserver: class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    });
  });

  afterEach(() => {
    stop();
    stop = () => {};
    Reflect.deleteProperty(document.documentElement, "scrollHeight");
    Reflect.deleteProperty(document.documentElement, "clientHeight");
    Reflect.deleteProperty(window, "scrollY");
    Reflect.deleteProperty(globalThis, "ResizeObserver");
  });

  it("spends the whole spare height across a long page", async () => {
    const image = follow();
    setPage(6000, 2500);
    await scroll();
    expect(image.style.transform).toBe("translateY(-100px)");
    setPage(6000, 5000);
    await scroll();
    expect(image.style.transform).toBe("translateY(-200px)");
  });

  it("keeps drifting slowly on a short page instead of racing through the spare height", async () => {
    const image = follow();
    setPage(1400, 400);
    await scroll();
    expect(image.style.transform).toBe("translateY(-60px)");
  });

  it("stays put when the page cannot scroll", async () => {
    const image = follow();
    setPage(1000, 0);
    await scroll();
    expect(image.style.transform).toBe("translateY(0px)");
  });

  it("never opens a gap during rubber-band overscroll", async () => {
    const image = follow();
    setPage(6000, -50);
    await scroll();
    expect(image.style.transform).toBe("translateY(0px)");
    setPage(6000, 5100);
    await scroll();
    expect(image.style.transform).toBe("translateY(-200px)");
  });

  it("recalculates when the page grows without a scroll event", async () => {
    const image = follow();
    setPage(6000, 2500);
    await scroll();
    setPage(11000, 2500);
    resized();
    await nextFrame();
    expect(image.style.transform).toBe("translateY(-50px)");
  });

  it("leaves the element still under reduced motion", async () => {
    reducedMotion = true;
    const image = follow();
    setPage(6000, 2500);
    await scroll();
    expect(image.style.transform).toBe("");
  });

  it("stops following and clears its position when cleaned up", async () => {
    const image = follow();
    setPage(6000, 2500);
    await scroll();
    stop();
    expect(disconnect).toHaveBeenCalled();
    expect(image.style.transform).toBe("");
    await scroll();
    expect(image.style.transform).toBe("");
  });
});
