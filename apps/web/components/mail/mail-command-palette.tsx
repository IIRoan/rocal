"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import { PrivateSearchIndexPrompt } from "../command-palette/private-search-index-prompt";
import { TransitionContainer } from "../command-palette/transition-container";
import { MailCommandPaletteViewContent } from "./mail-command-palette-view-content";
import { useMailCommandPaletteController } from "./use-mail-command-palette-controller";
import type { JmapEmailMessage, JmapMailbox, LabelDef } from "@/lib/mail/types";

const EMPTY_MAILBOXES: JmapMailbox[] = [];
const EMPTY_LABELS: LabelDef[] = [];

export interface MailCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompose: () => void;
  mailboxes?: JmapMailbox[];
  onCreateMailbox?: (name: string) => Promise<void>;
  onDeleteMailbox?: (id: string) => Promise<void>;
  onRenameMailbox?: (id: string, name: string) => Promise<void>;
  labels?: LabelDef[];
  onCreateLabel?: (name: string, color: string) => Promise<LabelDef | null>;
  onUpdateLabel?: (
    labelId: string,
    updates: { name: string; color: string },
  ) => Promise<void>;
  onDeleteLabel?: (id: string) => Promise<void>;
  initialView?: string;
  messages?: JmapEmailMessage[];
  onSelectMessage?: (id: string) => void;
}

export function MailCommandPalette({
  open,
  onOpenChange,
  onCompose,
  mailboxes = EMPTY_MAILBOXES,
  onCreateMailbox,
  onDeleteMailbox,
  onRenameMailbox,
  labels = EMPTY_LABELS,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
  initialView,
  onSelectMessage,
}: MailCommandPaletteProps) {
  const c = useMailCommandPaletteController({
    open,
    onOpenChange,
    onCompose,
    mailboxes,
    onCreateMailbox,
    onDeleteMailbox,
    onRenameMailbox,
    labels,
    onCreateLabel,
    onUpdateLabel,
    onDeleteLabel,
    initialView,
    onSelectMessage,
  });
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          variant="spotlight"
          showClose={false}
          aria-describedby={undefined}
          className="flex w-[640px] flex-col overflow-hidden rounded-xl border-[var(--border-secondary)] bg-[var(--bg-l3-solid)] p-0 shadow-[var(--shadow-l3)]"
          onKeyDown={c.handleKeyDown}
        >
          <div style={{ display: "contents" }}>
            <VisuallyHidden>
              <DialogTitle>Mail</DialogTitle>
            </VisuallyHidden>
            <TransitionContainer viewKey={c.currentView}>
              <MailCommandPaletteViewContent
                open={open}
                currentView={c.currentView}
                query={c.chrome.query}
                onQueryChange={c.setQuery}
                selectedIndex={c.chrome.selectedIndex}
                showUnifiedSearch={c.showUnifiedSearch}
                unifiedResults={c.unifiedResults}
                unifiedSearchLoading={c.unifiedSearchLoading}
                mainListItems={c.mainListItems}
                onSelectItem={c.handleSelect}
                onSelectUnifiedResult={c.handleUnifiedResultSelect}
                goBack={c.goBack}
                goForward={c.goForward}
                localSettings={c.localSettings}
                updateSetting={c.updateSetting}
                passkeyAddMode={c.chrome.passkeyAddMode}
                privateSearchIndex={c.privateSearchIndex}
                sessionName={c.session?.user?.name}
                sessionEmail={c.session?.user?.email}
                accountImage={c.accountImage}
                sessionLoading={c.sessionLoading}
                deletingAccount={c.busy.deletingAccount}
                changingPassword={c.busy.changingPassword}
                settingPassword={c.busy.settingPassword}
                resettingEncryptionPassword={c.busy.resettingEncryptionPassword}
                updatingProfile={c.busy.updatingProfile}
                hasPasswordAccount={c.hasPasswordAccount}
                hasOAuthAccount={c.hasOAuthAccount}
                handleDeleteAccount={c.handleDeleteAccount}
                handleChangePassword={c.handleChangePassword}
                handleSetPassword={c.handleSetPassword}
                handleResetEncryptionPassword={c.handleResetEncryptionPassword}
                handleUpdateProfile={c.handleUpdateProfile}
                mailboxes={c.mailboxes}
                onCreateMailbox={c.onCreateMailbox}
                onDeleteMailbox={c.onDeleteMailbox}
                onRenameMailbox={c.onRenameMailbox}
                labels={c.labels}
                onCreateLabel={c.onCreateLabel}
                onUpdateLabel={c.onUpdateLabel}
                onDeleteLabel={c.onDeleteLabel}
              />
            </TransitionContainer>
          </div>
        </DialogContent>
      </Dialog>
      <PrivateSearchIndexPrompt open={open} query={c.chrome.query} />
    </>
  );
}
