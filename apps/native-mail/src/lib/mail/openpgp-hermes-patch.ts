// Hermes omits Symbol.species for Array subclasses, so openpgp's PacketList loses filterByTag() after concat(); re-wrap results.

type ArrayLikeConstructor = {
  new (): unknown[];
  prototype: unknown[];
  __hermesSpeciesPatched?: boolean;
};

const ARRAY_METHODS = [
  "concat",
  "slice",
  "filter",
  "splice",
  "map",
  "flat",
  "flatMap",
] as const;

/** Re-wraps an Array subclass's array-returning methods as the subclass; idempotent, `false` when already patched. */
export function applyHermesPacketListPatch(
  PacketList: ArrayLikeConstructor | undefined | null,
): boolean {
  if (!PacketList || PacketList.__hermesSpeciesPatched) {
    return false;
  }

  const proto = PacketList.prototype as Record<string, unknown> & unknown[];

  const toPacketList = (items: ArrayLike<unknown>): unknown[] => {
    const list = new PacketList();
    for (let i = 0; i < items.length; i++) {
      list[i] = items[i];
    }
    list.length = items.length;
    return list;
  };

  for (const name of ARRAY_METHODS) {
    const original = Array.prototype[name as keyof typeof Array.prototype] as
      | ((...args: unknown[]) => unknown)
      | undefined;
    if (typeof original !== "function") {
      continue;
    }
    Object.defineProperty(proto, name, {
      configurable: true,
      writable: true,
      value: function hermesSpeciesPatched(...args: unknown[]): unknown {
        const result = original.apply(this, args);
        return Array.isArray(result) ? toPacketList(result) : result;
      },
    });
  }

  Object.defineProperty(PacketList, "__hermesSpeciesPatched", {
    value: true,
    configurable: true,
  });

  return true;
}
