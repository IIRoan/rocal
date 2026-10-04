declare function useEvents(): { data: ReadonlyArray<{ title: string }> };

export function EventsPage() {
  const { data } = useEvents();
  return <span>{data.length}</span>;
}
