"use client";

import {
  SidebarProvider,
  SidebarInset,
} from "@workspace/ui/components/ui/sidebar";
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
    handleOpenCompose,
    setIsPaletteOpen,
    handleOpenMailboxesPalette,
    handleSignOut,
    handleReorderMailboxes,
    isBusy,
    isMobile,
    showMobileDetailPane,
    selectedMailboxName,
    accountEmail,
    isRefreshing,
    handleManualRefresh,
  } = controller;

  return (
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
      />
      <SidebarInset className="min-h-0 overflow-hidden">
        {activeMailbox ? (
          <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
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
  );
}
