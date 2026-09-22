"use client";

import {
  SidebarProvider,
  SidebarInset,
} from "@workspace/ui/components/ui/sidebar";
import { SolaceTheme } from "@workspace/ui/solace";
import { MailSidebar } from "../mail-sidebar";
import { MobileMailHeader } from "../mail-app-mobile-header";
import { MailAppListColumn } from "./mail-app-list-column";
import { MailAppDetailPane } from "./mail-app-detail-pane";
import type { MailAppContentController } from "../use-mail-app-content-controller";

export function MailAppMainLayout({
  controller,
}: {
  controller: MailAppContentController;
}) {
  const {
    user,
    activeMailbox,
    handleSelectMailbox,
    handleSelectLabel,
    handleOpenCompose,
    setIsPaletteOpen,
    handleOpenMailboxesPalette,
    handleOpenLabelsPalette,
    handleSignOut,
    handleReorderMailboxes,
    isBusy,
    isMobile,
    showMobileDetailPane,
    selectedMailboxName,
    accountEmail,
    isRefreshing,
    handleManualRefresh,
    labels,
    activeLabelId,
  } = controller;

  return (
    <SolaceTheme className="h-svh max-h-svh overflow-hidden">
    <SidebarProvider className="h-svh max-h-svh min-h-0 overflow-hidden">
      <MailSidebar
        user={user ?? { name: "User", email: "" }}
        activeMailbox={activeMailbox}
        onSelectMailbox={(id) => handleSelectMailbox(id)}
        onCompose={() => handleOpenCompose()}
        onOpenPalette={() => setIsPaletteOpen(true)}
        onOpenSearch={() => setIsPaletteOpen(true)}
        onOpenMailboxes={handleOpenMailboxesPalette}
        onSignOut={() => void handleSignOut()}
        onReorderMailboxes={(reordered) => void handleReorderMailboxes(reordered)}
        isBusy={isBusy}
        labels={labels}
        activeLabelId={activeLabelId}
        onSelectLabel={handleSelectLabel}
        onOpenLabels={handleOpenLabelsPalette}
      />
      <SidebarInset className="min-h-0 overflow-hidden border border-[var(--border-secondary)] bg-[var(--bg-l1-solid)] shadow-[var(--shadow-l1)] lg:peer-data-[variant=inset]:rounded-xl">
        {activeMailbox ? (
          <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-l1-solid)]">
            {isMobile && !showMobileDetailPane && (
              <MobileMailHeader
                selectedMailboxName={selectedMailboxName}
                mailboxEmail={activeMailbox.email ?? accountEmail}
                refresh={{
                  disabled: isBusy || isRefreshing,
                  spinning: isRefreshing,
                }}
                onRefresh={() => void handleManualRefresh()}
                onCompose={() => handleOpenCompose()}
              />
            )}

            <div className="flex flex-1 min-h-0 overflow-hidden relative">
              <MailAppListColumn controller={controller} />
              <MailAppDetailPane controller={controller} />
            </div>
          </div>
        ) : null}
      </SidebarInset>
    </SidebarProvider>
    </SolaceTheme>
  );
}
