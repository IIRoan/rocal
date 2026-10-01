import { memoizeStyles } from "./memoize-styles";

describe("memoizeStyles", () => {
  it("builds once per argument identity", () => {
    const create = jest.fn((theme: object, skin: object) => ({ theme, skin }));
    const getStyles = memoizeStyles(create);
    const theme = {};
    const skin = {};

    expect(getStyles(theme, skin)).toBe(getStyles(theme, skin));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("rebuilds when any argument changes", () => {
    const create = jest.fn((theme: object, skin: object) => ({ theme, skin }));
    const getStyles = memoizeStyles(create);
    const theme = {};
    const skin = {};

    const first = getStyles(theme, skin);
    expect(getStyles(theme, {})).not.toBe(first);
    expect(getStyles({}, skin)).not.toBe(first);
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("supports a single argument", () => {
    const create = jest.fn((theme: object) => ({ theme }));
    const getStyles = memoizeStyles(create);
    const theme = {};

    expect(getStyles(theme)).toBe(getStyles(theme));
    expect(create).toHaveBeenCalledTimes(1);
  });
});
