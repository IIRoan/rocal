import { MAIL_LABEL_GHOST_COLOR } from "./mail-label-colors";

interface MessageLabel {
  id: string;
  name: string;
  color: string;
}

interface MessageKeywords {
  keywords?: Record<string, boolean>;
}

export function getMessageLabels(
  message: MessageKeywords,
  labels: MessageLabel[],
): MessageLabel[] {
  if (!message.keywords) return [];
  return labels.filter((label) => message.keywords?.[`label:${label.id}`] === true);
}

export function getAllMessageLabels(
  message: MessageKeywords,
  knownLabels: MessageLabel[],
): MessageLabel[] {
  if (!message.keywords) return [];
  const labels = getMessageLabels(message, knownLabels);
  const knownIds = new Set(labels.map((label) => label.id));
  for (const key of Object.keys(message.keywords)) {
    if (!key.startsWith("label:")) continue;
    const id = key.slice("label:".length);
    if (!knownIds.has(id)) {
      labels.push({ id, name: id, color: MAIL_LABEL_GHOST_COLOR });
    }
  }
  return labels;
}
