export type SectionMessage =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string }
  | null;

export type SecurityAccessKind =
  | "password"
  | "oauth-only"
  | "oauth-and-password"
  | "none";
