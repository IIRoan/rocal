import { useEffect, useState } from "react";

declare function loadLocalEncryptedIndex(userId: string): Promise<string[]>;
declare function reportFailure(error: unknown): void;

export function useLocalIndex(userId: string) {
  const [index, setIndex] = useState<string[]>([]);
  useEffect(() => {
    const load = async () => {
      const result = await loadLocalEncryptedIndex(userId);
      setIndex(result);
    };
    void load().catch(reportFailure);
  }, [userId]);
  return index;
}
