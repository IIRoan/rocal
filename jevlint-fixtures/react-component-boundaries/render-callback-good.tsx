export function EventList({ titles }: { titles: readonly string[] }) {
  return (
    <ul>
      {titles.map((title) => (
        <li key={title}>{title}</li>
      ))}
    </ul>
  );
}
