declare const eventContentSchema: {
  parse: (input: unknown) => { title: string };
};

export function readImportedEvent(text: string): { title: string } {
  const input: unknown = JSON.parse(text);
  return eventContentSchema.parse(input);
}
