import { expect } from "@jest/globals";

export async function expectValidationError(
  response: Response,
  ...messageFragments: string[]
) {
  expect(response.status).toBe(422);
  const text = await response.text();
  for (const fragment of messageFragments) {
    expect(text).toContain(fragment);
  }
}
