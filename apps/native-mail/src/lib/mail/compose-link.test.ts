import { normalizeComposeLink } from "./compose-link";

it("adds https to a bare host and keeps schemes, paths and fragments", () => {
  expect(normalizeComposeLink(" solace.onl/docs ")).toBe("https://solace.onl/docs");
  expect(normalizeComposeLink("mailto:a@solace.onl")).toBe("mailto:a@solace.onl");
  expect(normalizeComposeLink("javascript:alert(1)")).toBe("javascript:alert(1)");
  expect(normalizeComposeLink("#top")).toBe("#top");
  expect(normalizeComposeLink("")).toBe("");
});
