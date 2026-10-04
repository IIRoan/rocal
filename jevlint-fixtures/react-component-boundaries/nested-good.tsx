import { useState } from "react";

function FilterInput() {
  const [text, setText] = useState("");
  return (
    <input value={text} onChange={(event) => setText(event.target.value)} />
  );
}

export function EventList() {
  return <FilterInput />;
}
