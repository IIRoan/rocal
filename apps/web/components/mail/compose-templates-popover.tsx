"use client";

import { FileText } from "lucide-react";
import { mailTemplatePreview, type MailTemplate } from "@workspace/calendar-core";
import { ComposeMenuNote, ComposeToolMenu } from "./compose-menu";

export function ComposeTemplatesPopover({
  templates,
  disabled,
  onInsert,
}: {
  templates: MailTemplate[];
  disabled: boolean;
  onInsert: (template: MailTemplate) => void;
}) {
  return (
    <ComposeToolMenu label="Insert template" icon={FileText} disabled={disabled} className="w-[21rem]">
      {(close) => (
        <>
          {templates.length === 0 ? (
            <p className="px-2.5 pb-2 text-sm leading-snug text-muted-foreground">
              No templates yet. Add one in Mail settings under Templates.
            </p>
          ) : (
            templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  close();
                  onInsert(template);
                }}
                className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-foreground">{template.name}</span>
                  <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                    {mailTemplatePreview(template)}
                  </span>
                </span>
              </button>
            ))
          )}
          {templates.length > 0 ? <ComposeMenuNote>Manage templates in Mail settings.</ComposeMenuNote> : null}
        </>
      )}
    </ComposeToolMenu>
  );
}
