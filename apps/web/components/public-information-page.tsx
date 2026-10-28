import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo, ThemeToggle } from "@workspace/ui/components/layout";
import { PRODUCT_ROUTES } from "@workspace/calendar-core/product-info";

export function PublicInformationPage({
  title,
  eyebrow,
  description,
  currentPath,
  children,
}: {
  title: string;
  eyebrow: string;
  description: string;
  currentPath: string;
  children: ReactNode;
}) {
  return (
    <section className="min-h-dvh flex">
      <div className="relative flex w-full flex-col justify-center px-6 py-10 sm:px-12 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-10 flex items-center justify-between">
            <Logo
              width={44}
              height={44}
              className="text-primary"
              aria-label="Solace"
            />
            <ThemeToggle />
          </div>
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {description}
            </p>
          </div>
          <div className="flex flex-col gap-8 text-sm leading-7 text-muted-foreground">
            {children}
          </div>
          <nav
            aria-label="Help and privacy"
            className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm"
          >
            <Link
              href="/"
              className="inline-flex items-center gap-2 font-medium text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ArrowLeft className="size-4" aria-hidden="true" /> Back to Solace
            </Link>
            <Link
              href={PRODUCT_ROUTES.support}
              aria-current={
                currentPath === PRODUCT_ROUTES.support ? "page" : undefined
              }
              className="text-primary underline-offset-4 hover:underline cursor-pointer"
            >
              Support
            </Link>
            <Link
              href={PRODUCT_ROUTES.privacy}
              aria-current={
                currentPath === PRODUCT_ROUTES.privacy ? "page" : undefined
              }
              className="text-primary underline-offset-4 hover:underline cursor-pointer"
            >
              Privacy
            </Link>
          </nav>
        </div>
      </div>
      <div className="hidden lg:block lg:w-1/2 relative">
        <div className="absolute inset-4 rounded-2xl overflow-hidden border border-border">
          <Image
            src="/wallpaper.jpg"
            alt=""
            className="size-full object-cover"
            fill
            sizes="50vw"
            unoptimized
          />
        </div>
      </div>
    </section>
  );
}
