"use client";

import {
  SidebarProvider,
  SidebarInset,
} from "@workspace/ui/components/ui/sidebar";
import { SolaceTheme } from "@workspace/ui/solace";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "@workspace/ui/lib/toast";
import { getErrorMessage } from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";
import { MailSidebar } from "../mail-sidebar";
import { MobileMailHeader } from "../mail-app-mobile-header";
import { MailAppListColumn } from "./mail-app-list-column";
import { MailAppDetailPane } from "./mail-app-detail-pane";
import type { MailAppContentController } from "../use-mail-app-content-controller";

const log = createLogger("mail-app-main-layout");

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
    scheduledSendCount,
    handleOpenScheduledPalette,
  } = controller;

  return (
    <SolaceTheme className={cn("h-svh max-h-svh overflow-hidden", !isMobile && "mail-desktop")}>
    <SidebarProvider className="h-svh max-h-svh min-h-0 overflow-hidden">
      <MailSidebar
        user={user ?? { name: "User", email: "" }}
        activeMailbox={activeMailbox}
        onSelectMailbox={(id) => handleSelectMailbox(id)}
        onCompose={() => handleOpenCompose()}
        onOpenPalette={() => setIsPaletteOpen(true)}
        onOpenSearch={() => setIsPaletteOpen(true)}
        onOpenMailboxes={handleOpenMailboxesPalette}
        onSignOut={() =>
          void handleSignOut().catch((error) =>
            log.error("Failed to sign out", error),
          )
        }
        onReorderMailboxes={(reordered) =>
          void handleReorderMailboxes(reordered).catch((error) =>
            log.error("Failed to reorder mailboxes", error),
          )
        }
        isBusy={isBusy}
        labels={labels}
        activeLabelId={activeLabelId}
        onSelectLabel={handleSelectLabel}
        onOpenLabels={handleOpenLabelsPalette}
        scheduledCount={scheduledSendCount}
        onOpenScheduled={handleOpenScheduledPalette}
      />
      <SidebarInset
        className={
          isMobile
            ? "min-h-0 overflow-hidden bg-[var(--bg-l1-solid)]"
            : "m-2 min-h-0 overflow-hidden bg-transparent"
        }
      >
        {activeMailbox ? (
          <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", isMobile && "bg-[var(--bg-l1-solid)]")}>
            {isMobile && !showMobileDetailPane && (
              <MobileMailHeader
                selectedMailboxName={selectedMailboxName}
                mailboxEmail={activeMailbox.email ?? accountEmail}
                refresh={{
                  disabled: isBusy || isRefreshing,
                  spinning: isRefreshing,
                }}
                onRefresh={() =>
                  void handleManualRefresh().catch((error) =>
                    toast.error(
                      getErrorMessage(error, "Could not refresh mail. Check your connection and try again."),
                    ),
                  )
                }
                onCompose={() => handleOpenCompose()}
              />
            )}

            <div className={cn(
              "@container relative flex min-h-0 flex-1 overflow-hidden",
              !isMobile && "mail-panes rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-l2-solid)]",
            )}>
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
