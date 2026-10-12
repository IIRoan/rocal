import { afterPaint } from "./after-paint";

const frameQueue: Array<{ id: number; callback: () => void }> = [];
let nextFrameId = 1;

function runFrame() {
  const due = frameQueue.splice(0);
  for (const frame of due) frame.callback();
}

beforeEach(() => {
  frameQueue.length = 0;
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: () => void) => {
      const id = nextFrameId++;
      frameQueue.push({ id, callback });
      return id;
    },
    cancelAnimationFrame: (id: number) => {
      const index = frameQueue.findIndex((frame) => frame.id === id);
      if (index >= 0) frameQueue.splice(index, 1);
    },
  });
});

describe("afterPaint", () => {
  it("runs the callback on the second frame, after the first one has drawn", () => {
    const callback = jest.fn();
    afterPaint(callback);

    runFrame();
    expect(callback).not.toHaveBeenCalled();

    runFrame();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("never runs once cancelled, before or between frames", () => {
    const early = jest.fn();
    afterPaint(early)();
    const late = jest.fn();
    const cancelLate = afterPaint(late);
    runFrame();
    cancelLate();

    runFrame();
    runFrame();
    expect(early).not.toHaveBeenCalled();
    expect(late).not.toHaveBeenCalled();
  });
});
