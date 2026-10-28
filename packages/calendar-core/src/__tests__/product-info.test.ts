import { productLinks, supportContactUrl } from "../product-info";

describe("public product links", () => {
  it("derives privacy and support from the configured origin without copying URL credentials or queries", () => {
    expect(
      productLinks("https://preview.example.test/app?token=private#session"),
    ).toMatchObject({
      privacy: "https://preview.example.test/privacy",
      support: "https://preview.example.test/support",
    });
  });

  it.each([
    null,
    "",
    "invalid",
    "javascript:alert(1)",
    "file:///private",
    "https://user:password@example.test",
  ])("does not expose invalid website origins: %s", (origin) => {
    expect(productLinks(origin)).toMatchObject({
      privacy: null,
      support: null,
    });
  });

  it("supports a local development origin", () => {
    expect(productLinks("http://localhost:3000/").support).toBe(
      "http://localhost:3000/support",
    );
  });

  it("requires an explicitly configured, valid contact address", () => {
    expect(supportContactUrl(" support@example.test ")).toBe(
      "mailto:support@example.test",
    );
    expect(supportContactUrl(null)).toBeNull();
    expect(supportContactUrl("invalid")).toBeNull();
    expect(supportContactUrl("user@example.test?body=private")).toBeNull();
  });
});
