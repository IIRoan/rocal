declare function submitPurchase(): Promise<void>;
declare function reportFailure(error: unknown): void;

export function PurchaseButton() {
  return (
    <button onClick={() => void submitPurchase().catch(reportFailure)}>
      Purchase
    </button>
  );
}
