/** Full Better Auth session fixtures so mocks satisfy the strictly typed auth client. */
export const authUserFixture = {
  id: "user-1",
  name: "Roan",
  email: "roan@solace.onl",
  emailVerified: true,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z"),
};

export const authSessionRecordFixture = {
  id: "session-1",
  userId: "user-1",
  token: "session-token",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z"),
};

export const authSessionDataFixture = {
  user: authUserFixture,
  session: authSessionRecordFixture,
};
