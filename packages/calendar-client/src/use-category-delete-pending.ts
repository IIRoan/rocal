import { useIsMutating } from "@tanstack/react-query";
import { CATEGORY_DELETE_MUTATION_KEY } from "@workspace/calendar-core";

export function useCategoryDeletePending() {
  return useIsMutating({ mutationKey: CATEGORY_DELETE_MUTATION_KEY }) > 0;
}
