import type { Metadata } from "next";
import {
  PRODUCT_LICENSE_NOTICE,
  PRODUCT_ROUTES,
  PRODUCT_SOURCE_URL,
} from "@workspace/calendar-core/product-info";
import {
  THIRD_PARTY_LICENSE_GROUPS,
  licenseGroupKey,
  licenseGroupLabel,
} from "@workspace/calendar-core/third-party-notices";
import { PublicInformationPage } from "@/components/public-information-page";

export const metadata: Metadata = {
  title: "Licenses",
  description:
    "The license Solace is published under and the open source software Solace Calendar and Solace Mail include.",
};

export default function LicensesPage() {
  return (
    <PublicInformationPage
      eyebrow="Licenses"
      title="Open source licenses"
      description="Solace is open source and built on open source software. This page lists the packages the web and iPhone apps are built from, with their copyright notices and licenses."
      currentPath={PRODUCT_ROUTES.licenses}
    >
      <section aria-labelledby="licenses-solace">
        <h2
          id="licenses-solace"
          className="text-base font-semibold text-foreground"
        >
          Solace
        </h2>
        <p className="mt-2">
          {PRODUCT_LICENSE_NOTICE}{" "}
          <a
            href={PRODUCT_SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-4 cursor-pointer"
          >
            Read the source code
          </a>
          .
        </p>
      </section>
      <section aria-labelledby="licenses-third-party">
        <h2
          id="licenses-third-party"
          className="text-base font-semibold text-foreground"
        >
          Third-party software
        </h2>
        <p className="mt-2">
          Packages that share a license text are grouped. Open a group to read
          its packages, their copyright notices and the license.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {THIRD_PARTY_LICENSE_GROUPS.map((group) => {
            const label = licenseGroupLabel(group);
            return (
              <details
                key={licenseGroupKey(group)}
                className="rounded-lg border border-border"
              >
                <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-foreground">
                  <span className="min-w-0 break-words font-medium">
                    {label.title}
                  </span>
                  <span className="text-right text-xs text-muted-foreground">
                    {label.detail}
                  </span>
                </summary>
                <div className="border-t border-border p-3 text-xs leading-5">
                  <ul className="flex flex-col gap-2">
                    {group.packages.map((pkg) => (
                      <li key={`${pkg.name}@${pkg.version}`}>
                        <span className="font-medium text-foreground">
                          {pkg.name}
                        </span>{" "}
                        {pkg.version}
                        {pkg.copyright.map((line) => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))}
                        {pkg.notice ? (
                          <span className="mt-1 block whitespace-pre-wrap">
                            {pkg.notice}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {group.text ? (
                    <p className="mt-4 whitespace-pre-wrap break-words">
                      {group.text}
                    </p>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </PublicInformationPage>
  );
}
