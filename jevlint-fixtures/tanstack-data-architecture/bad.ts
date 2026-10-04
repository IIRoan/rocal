declare function useState<T>(initial: T): [T, (value: T) => void];
declare function useEffect(effect: () => void, dependencies: unknown[]): void;

export function useEvents() {
  const [events, setEvents] = useState<unknown[]>([]);
  useEffect(() => {
    void fetch("/api/events")
      .then((response) => response.json())
      .then(setEvents);
  }, []);
  return events;
}
