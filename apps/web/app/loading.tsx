import { Logo } from "@workspace/ui/components/layout";

export default function Loading() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background">
      <Logo width={48} height={48} className="text-primary animate-pulse mb-4" />
      <span className="sr-only">Loading...</span>
    </div>
  );
}
