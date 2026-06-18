import { expect } from "@jest/globals";

export async function expectValidationError(
  response: Response,
  ...messageFragments: string[]
) {
  expect([400, 422]).toContain(response.status);
  const text = await response.text();
  for (const fragment of messageFragments) {
    expect(text).toContain(fragment);
  }
}
