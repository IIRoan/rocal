import { PageLoadingOverlay } from "@workspace/ui/components/ui";

export default function Loading() {
  return <PageLoadingOverlay isLoading={true} messageContext="PAGE_LOAD" />;
}
