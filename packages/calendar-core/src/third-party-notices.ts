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

/** Names a lone package itself, and a license several groups share by the group's first packages, so no two rows read alike. */
export function licenseGroupLabel(
  group: ThirdPartyLicenseGroup,
  groups: readonly ThirdPartyLicenseGroup[] = THIRD_PARTY_LICENSE_GROUPS,
): { title: string; detail: string } {
  const names = [...new Set(group.packages.map((pkg) => pkg.name))];
  const [first, second] = names;
  if (names.length === 1 && first) {
    return { title: first, detail: group.license };
  }
  const licenseRepeats = groups.some(
    (other) =>
      other !== group &&
      other.packages.length > 1 &&
      other.license === group.license,
  );
  if (!licenseRepeats || !first || !second) {
    return { title: group.license, detail: `${group.packages.length} packages` };
  }
  return {
    title: group.license,
    detail:
      names.length === 2
        ? `${first} and ${second}`
        : `${first}, ${second} and ${names.length - 2} more`,
  };
}
