import { afterEach, expect, it } from "@jest/globals";

import { GET } from "../../app/admin/route";

const previous = process.env.STALWART_ADMIN_URL;

afterEach(() => {
  if (previous === undefined) delete process.env.STALWART_ADMIN_URL;
  else process.env.STALWART_ADMIN_URL = previous;
});

it("keeps an unconfigured environment out of the production admin UI", () => {
  delete process.env.STALWART_ADMIN_URL;
  const response = GET();
  expect(response.status).toBe(404);
  expect(response.headers.get("Location")).toBeNull();
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it.each([
  "https://mail-preview.solace.test/admin/",
  "http://127.0.0.1:58082/admin/",
  "http://[::1]:58082/admin/",
])("uses the configured environment target %s", (target) => {
  process.env.STALWART_ADMIN_URL = target;
  const response = GET();
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe(target);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it.each([
  "invalid",
  "http://mail.solace.test/admin/",
  "https://operator:secret@mail.solace.test/admin/",
  "https://mail.solace.test/admin/?token=secret",
  "https://mail.solace.test/admin/#token",
  "https://mail.solace.test/",
])("refuses a malformed or unsafe target %s", (target) => {
  process.env.STALWART_ADMIN_URL = target;
  const response = GET();
  expect(response.status).toBe(503);
  expect(response.headers.get("Location")).toBeNull();
});
