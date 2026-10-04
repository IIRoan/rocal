declare function useEvents(): { data: Array<{ title: string }> };

export function useSortedEvents() {
  const { data } = useEvents();
  data.sort((left, right) => left.title.localeCompare(right.title));
  return data;
}
