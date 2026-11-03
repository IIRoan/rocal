import { describe, expect, it } from "@jest/globals";

import {
  THIRD_PARTY_LICENSE_GROUPS,
  licenseGroupLabel,
  type ThirdPartyLicenseGroup,
} from "./third-party-notices";

function group(license: string, ...names: string[]): ThirdPartyLicenseGroup {
  return {
    license,
    text: `${license} text`,
    packages: names.map((name) => ({ name, version: "1.0.0", copyright: [] })),
  };
}

describe("licenseGroupLabel", () => {
  const lone = group("MIT", "left-pad");
  const sameNameTwice = group("ISC", "accepts", "accepts");
  const wide = group("MIT", "accepts", "accepts", "agent-base", "bytes", "debug");
  const pair = group("MIT", "readable-stream", "string_decoder");
  const unique = group("BSD-2-Clause", "entities", "esprima", "uri-js");
  const groups = [lone, sameNameTwice, wide, pair, unique];

  it("names a lone package and keeps the license as detail", () => {
    expect(licenseGroupLabel(lone, groups)).toEqual({
      title: "left-pad",
      detail: "MIT",
    });
    expect(licenseGroupLabel(sameNameTwice, groups)).toEqual({
      title: "accepts",
      detail: "ISC",
    });
  });

  it("tells apart groups that share a license by their first packages", () => {
    expect(licenseGroupLabel(wide, groups)).toEqual({
      title: "MIT",
      detail: "accepts, agent-base and 2 more",
    });
    expect(licenseGroupLabel(pair, groups)).toEqual({
      title: "MIT",
      detail: "readable-stream and string_decoder",
    });
  });

  it("counts packages when the license appears once", () => {
    expect(licenseGroupLabel(unique, groups)).toEqual({
      title: "BSD-2-Clause",
      detail: "3 packages",
    });
  });

  it("gives every shipped group its own label", () => {
    const labels = THIRD_PARTY_LICENSE_GROUPS.map((entry) => {
      const { title, detail } = licenseGroupLabel(entry);
      return `${title} ${detail}`;
    });
    expect(new Set(labels).size).toBe(labels.length);
  });
});
