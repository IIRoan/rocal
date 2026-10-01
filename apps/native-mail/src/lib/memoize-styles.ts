/** Builds a style sheet once per theme/skin object instead of once per mounted list row. */
export function memoizeStyles<Args extends object[], Result extends object>(
  create: (...args: Args) => Result,
): (...args: Args) => Result {
  const root = new WeakMap<object, unknown>();

  return (...args) => {
    let node = root;
    for (const key of args.slice(0, -1)) {
      let next = node.get(key) as WeakMap<object, unknown> | undefined;
      if (!next) {
        next = new WeakMap();
        node.set(key, next);
      }
      node = next;
    }

    const leafKey = args[args.length - 1];
    let styles = node.get(leafKey) as Result | undefined;
    if (!styles) {
      styles = create(...args);
      node.set(leafKey, styles);
    }
    return styles;
  };
}
