import { useState } from "react";

export function EventList() {
  function FilterInput() {
    const [text, setText] = useState("");
    return (
      <input value={text} onChange={(event) => setText(event.target.value)} />
    );
  }
  return <FilterInput />;
}
