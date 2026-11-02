import notices from "./third-party-notices.json";

export interface ThirdPartyPackage {
  name: string;
  version: string;
  copyright: string[];
  notice?: string;
}

export interface ThirdPartyLicenseGroup {
  license: string;
  text: string;
  packages: ThirdPartyPackage[];
}

/** The npm packages behind the apps, grouped by shared license text; regenerate with `bun run notices`. */
export const THIRD_PARTY_LICENSE_GROUPS: readonly ThirdPartyLicenseGroup[] =
  notices.groups;

export function licenseGroupKey(group: ThirdPartyLicenseGroup): string {
  const first = group.packages[0];
  return `${group.license}:${first?.name}@${first?.version}`;
}

export function licenseGroupCount(group: ThirdPartyLicenseGroup): string {
  const count = group.packages.length;
  return `${count} ${count === 1 ? "package" : "packages"}`;
}
