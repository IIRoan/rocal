/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { PdfAttachmentThumbnail } from "../../components/mail/attachment-preview-dialog";

const mockGetDocument = jest.fn();

jest.mock("lucide-react", () => ({
  FileText: () => null,
  Loader2: () => null,
  Minus: () => null,
  Plus: () => null,
}));

jest.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const originalGetContext = HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => ({ setTransform: jest.fn() }),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: originalGetContext,
  });
  jest.clearAllMocks();
});

it("renders a PDF.js 6 thumbnail and destroys its loading task", async () => {
  const render = jest.fn(() => ({
    promise: Promise.resolve(),
    cancel: jest.fn(),
  }));
  const destroy = jest.fn(async () => undefined);
  mockGetDocument.mockReturnValue({
    promise: Promise.resolve({
      getPage: async () => ({
        getViewport: () => ({ width: 28, height: 40 }),
        render,
      }),
    }),
    destroy,
  });

  await act(async () => root.render(<PdfAttachmentThumbnail url="blob:pdf" />));

  expect(render).toHaveBeenCalledTimes(1);
  expect(destroy).toHaveBeenCalledTimes(1);
  expect(container.textContent).not.toContain("PDF preview unavailable");
  expect(container.querySelector("canvas")?.className).not.toContain(
    "invisible",
  );
});

it("handles rejected loading-task cleanup when a thumbnail unmounts", async () => {
  const destroy = jest.fn(async () => {
    throw new Error("Worker already stopped");
  });
  mockGetDocument.mockReturnValue({
    promise: new Promise(() => undefined),
    destroy,
  });
  await act(async () => root.render(<PdfAttachmentThumbnail url="blob:pdf" />));

  await act(async () => root.render(null));

  expect(destroy).toHaveBeenCalledTimes(1);
});
