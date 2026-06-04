// ---------------------------------------------------------------------------
// Hermes `Symbol.species` polyfill for openpgp's `PacketList`.
//
// Hermes does NOT implement `Symbol.species` for Array subclasses. openpgp's
// `PacketList extends Array`, and several internal code paths rely on native
// Array methods returning a `PacketList` rather than a plain `Array` — e.g.
// `Message.verify()` does:
//
//     packets = packets.concat(await readToEnd(packets.stream, ...));
//     const onePassSigList = packets.filterByTag(enums.packet.onePassSignature);
//
// On Hermes `packets.concat(...)` returns a plain `Array`, so the subsequent
// `packets.filterByTag(...)` throws "filterByTag is not a function". The same
// applies to `slice`, `filter`, `splice`, `map`, etc.
//
// This patch overrides those array-returning methods on `PacketList.prototype`
// so their results are re-wrapped as `PacketList` instances, emulating
// `Symbol.species` and keeping openpgp's assumptions intact on Hermes.
// ---------------------------------------------------------------------------

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

/**
 * Patches an Array subclass so that its inherited array-returning methods
 * return instances of the subclass instead of plain Arrays. Idempotent.
 *
 * @returns `true` if the patch was applied, `false` if it was already applied
 * or the class was not provided.
 */
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
