export function messageCountLabel(count: number): string {
  return count === 1 ? "1 message" : `${count} messages`;
}

export function deleteForeverPrompt(count: number): string {
  return count === 1
    ? "This message will be permanently deleted. This cannot be undone."
    : `${count} messages will be permanently deleted. This cannot be undone.`;
}

export function emptyMailboxResultMessage(count: number): string {
  return count === 0
    ? "Folder is already empty."
    : `Permanently deleted ${messageCountLabel(count)}.`;
}
