import { useEffect, useState } from "react";

declare function submitPurchase(): Promise<void>;
declare function reportFailure(error: unknown): void;

export function PurchaseButton() {
  const [clicked, setClicked] = useState(false);
  useEffect(() => {
    if (clicked) {
      void submitPurchase().catch(reportFailure);
    }
  }, [clicked]);
  return <button onClick={() => setClicked(true)}>Purchase</button>;
}
