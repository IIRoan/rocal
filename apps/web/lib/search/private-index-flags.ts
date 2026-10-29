/** The private search index switch, kept in this browser only. */
export const PRIVATE_CONTENT_INDEX_ENABLED_KEY = "search:private-content-index-enabled";

export function isPrivateContentIndexEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    window.localStorage.getItem(PRIVATE_CONTENT_INDEX_ENABLED_KEY) === "true"
  );
}
