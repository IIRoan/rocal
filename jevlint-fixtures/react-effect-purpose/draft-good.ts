import { useState } from "react";

export function useEditableDraft(initialTitle: string) {
  const [title, setTitle] = useState(initialTitle);
  return { title, setTitle };
}
