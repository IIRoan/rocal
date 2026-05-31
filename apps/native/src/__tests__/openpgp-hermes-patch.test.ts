import { applyHermesPacketListPatch } from "../lib/mail/openpgp-hermes-patch";

// Minimal stand-in for openpgp's PacketList: an Array subclass with a custom
// method that plain Arrays do not have.
class MockPacketList extends Array<{ tag: number }> {
  filterByTag(tag: number): MockPacketList {
    const filtered = new MockPacketList();
    for (let i = 0; i < this.length; i++) {
      if (this[i].tag === tag) {
        filtered.push(this[i]);
      }
    }
    return filtered;
  }
}

describe("applyHermesPacketListPatch", () => {
  it("overrides array-returning methods on the prototype", () => {
    class List extends Array {}
    expect(List.prototype.concat).toBe(Array.prototype.concat);

    const applied = applyHermesPacketListPatch(List as never);

    expect(applied).toBe(true);
    expect(List.prototype.concat).not.toBe(Array.prototype.concat);
    expect(List.prototype.slice).not.toBe(Array.prototype.slice);
    expect(List.prototype.filter).not.toBe(Array.prototype.filter);
    expect(List.prototype.splice).not.toBe(Array.prototype.splice);
    expect(List.prototype.map).not.toBe(Array.prototype.map);
  });

  it("is idempotent and sets a marker flag", () => {
    class List extends Array {}

    expect(applyHermesPacketListPatch(List as never)).toBe(true);
    expect(
      (List as unknown as { __hermesSpeciesPatched?: boolean })
        .__hermesSpeciesPatched,
    ).toBe(true);

    // Second call is a no-op.
    expect(applyHermesPacketListPatch(List as never)).toBe(false);
  });

  it("returns no-op false for missing class", () => {
    expect(applyHermesPacketListPatch(undefined)).toBe(false);
    expect(applyHermesPacketListPatch(null)).toBe(false);
  });

  it("preserves the subclass type (and custom methods) through concat", () => {
    applyHermesPacketListPatch(MockPacketList as never);

    const list = new MockPacketList();
    list.push({ tag: 1 }, { tag: 2 });

    const concatenated = list.concat([{ tag: 3 }]) as MockPacketList;

    expect(concatenated).toBeInstanceOf(MockPacketList);
    expect(typeof concatenated.filterByTag).toBe("function");
    expect(concatenated.filterByTag(3).length).toBe(1);
    expect(concatenated.length).toBe(3);
  });

  it("preserves the subclass type through slice, filter and splice", () => {
    applyHermesPacketListPatch(MockPacketList as never);

    const list = new MockPacketList();
    list.push({ tag: 1 }, { tag: 2 }, { tag: 3 });

    const sliced = list.slice(0, 2) as MockPacketList;
    expect(sliced).toBeInstanceOf(MockPacketList);
    expect(typeof sliced.filterByTag).toBe("function");
    expect(sliced.length).toBe(2);

    const filtered = list.filter((p) => p.tag !== 2) as MockPacketList;
    expect(filtered).toBeInstanceOf(MockPacketList);
    expect(typeof filtered.filterByTag).toBe("function");
    expect(filtered.length).toBe(2);

    const removed = list.splice(0, 1) as MockPacketList;
    expect(removed).toBeInstanceOf(MockPacketList);
    expect(typeof removed.filterByTag).toBe("function");
    expect(removed.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Hermes regression simulation.
//
// Node's V8 implements `Symbol.species`, so a native `class extends Array`
// already returns the subclass from `concat`/`slice`/`filter`. That means the
// tests above would pass even if the patch did nothing. To genuinely reproduce
// Hermes' behaviour (which lacks `Symbol.species`), we define a subclass whose
// `Symbol.species` resolves to `Array`. In Node this makes the native
// array-returning methods produce PLAIN Arrays — exactly the breakage seen on
// device, where `packets.concat(...).filterByTag(...)` throws
// "filterByTag is not a function". We then assert the patch fixes it.
// ---------------------------------------------------------------------------
describe("applyHermesPacketListPatch — Hermes breakage simulation", () => {
  // A PacketList whose species is Array, reproducing Hermes' missing
  // Symbol.species support inside Node's test environment.
  class HermesPacketList extends Array<{ tag: number }> {
    static get [Symbol.species](): ArrayConstructor {
      return Array;
    }

    filterByTag(tag: number): HermesPacketList {
      const filtered = new HermesPacketList();
      for (let i = 0; i < this.length; i++) {
        if (this[i].tag === tag) {
          filtered.push(this[i]);
        }
      }
      return filtered;
    }
  }

  it("reproduces the breakage before patching (sanity check)", () => {
    const list = new HermesPacketList();
    list.push({ tag: 1 }, { tag: 2 });

    const concatenated = list.concat([{ tag: 3 }]);

    // Native methods return a plain Array here, just like on Hermes.
    expect(concatenated).not.toBeInstanceOf(HermesPacketList);
    expect(
      (concatenated as Partial<HermesPacketList>).filterByTag,
    ).toBeUndefined();
  });

  it("fixes concat/slice/filter so filterByTag survives after patching", () => {
    applyHermesPacketListPatch(HermesPacketList as never);

    const list = new HermesPacketList();
    list.push({ tag: 1 }, { tag: 2 }, { tag: 3 });

    const concatenated = list.concat([{ tag: 1 }]) as HermesPacketList;
    expect(concatenated).toBeInstanceOf(HermesPacketList);
    expect(typeof concatenated.filterByTag).toBe("function");
    // The exact call site that crashed on device: chained filterByTag.
    expect(concatenated.filterByTag(1).length).toBe(2);

    const sliced = list.slice(1) as HermesPacketList;
    expect(sliced).toBeInstanceOf(HermesPacketList);
    expect(typeof sliced.filterByTag).toBe("function");

    const filtered = list.filter((p) => p.tag !== 2) as HermesPacketList;
    expect(filtered).toBeInstanceOf(HermesPacketList);
    expect(typeof filtered.filterByTag).toBe("function");
    expect(filtered.filterByTag(3).length).toBe(1);
  });

  it("keeps non-array results (e.g. map to scalars stays array-wrapped, find stays scalar)", () => {
    applyHermesPacketListPatch(HermesPacketList as never);

    const list = new HermesPacketList();
    list.push({ tag: 1 }, { tag: 2 });

    // `find` returns a single element (not an array) — must pass through.
    const found = list.find((p) => p.tag === 2);
    expect(found).toEqual({ tag: 2 });

    // `map` returns an array — re-wrapped, still iterable/correct.
    const tags = list.map((p) => p.tag);
    expect(Array.from(tags)).toEqual([1, 2]);
  });
});
