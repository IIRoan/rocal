import { getNativeRuntimeEnvironment } from "./native-environment";

let mockEnvironment: unknown;

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        get runtimeEnvironment() {
          return mockEnvironment;
        },
      },
    },
  },
}));

describe("native runtime environment", () => {
  it("uses the values resolved by Expo rather than a separate deployment configuration", () => {
    mockEnvironment = {
      apiUrl: "https://api.example.test",
      appUrl: "https://app.example.test",
      sentryDsn: "https://key@errors.example.test/solace",
    };
    expect(getNativeRuntimeEnvironment()).toEqual(mockEnvironment);
  });

  it.each([
    null,
    undefined,
    "invalid",
    { apiUrl: false, appUrl: 1, sentryDsn: {} },
  ])("handles older or malformed runtime configuration: %p", (value) => {
    mockEnvironment = value;
    expect(getNativeRuntimeEnvironment()).toEqual({
      apiUrl: "http://localhost:4001",
      appUrl: null,
      sentryDsn: null,
    });
  });
});
