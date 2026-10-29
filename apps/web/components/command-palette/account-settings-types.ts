export type SectionMessage =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string }
  | null;
