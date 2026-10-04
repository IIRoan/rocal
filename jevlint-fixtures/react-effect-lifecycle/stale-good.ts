import { useEffect, useState } from "react";

declare function loadLocalEncryptedIndex(userId: string): Promise<string[]>;
declare function reportFailure(error: unknown): void;

export function useLocalIndex(userId: string) {
  const [index, setIndex] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    void loadLocalEncryptedIndex(userId)
      .then((result) => {
        if (active) setIndex(result);
      })
      .catch(reportFailure);
    return () => {
      active = false;
    };
  }, [userId]);
  return index;
}
