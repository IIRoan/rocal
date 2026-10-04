type EventContent = { title: string };

export function readImportedEvent(text: string): EventContent {
  return JSON.parse(text) as EventContent;
}
