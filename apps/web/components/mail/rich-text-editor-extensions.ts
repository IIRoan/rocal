import { createMailEditorExtensions } from "@workspace/mail-editor";
import { buttonVariants } from "@workspace/ui/components/ui/button-variants";
import { cn } from "@workspace/ui/lib/utils";
import { ResizableImage } from "./resizable-image";

const quoteButton = buttonVariants({ variant: "ghost", size: "sm" });

export const richTextEditorExtensions = createMailEditorExtensions({
  image: ResizableImage,
  quoteToggleClass: cn(quoteButton, "-ml-2.5 min-w-0 justify-start font-normal text-muted-foreground [&>span]:min-w-0 [&>span]:truncate"),
  quoteRemoveClass: cn(quoteButton, "ml-auto font-normal text-muted-foreground"),
});
