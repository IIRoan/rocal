import { AppSidebar } from "../layout/app-sidebar";
import { SidebarCalendar } from "../navigation/sidebar-calendar";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "../ui/drawer";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../ui/sheet";
import { SidebarProvider, SIDEBAR_WIDTH_MOBILE } from "../ui/sidebar";
import { VisuallyHidden } from "../ui/visually-hidden";
import type { CalendarEvent, User } from "./types";

export function MobileCalendarOverlays({
  getCachedEventsForRange,
  isQuickNavOpen,
  isSidebarOpen,
  onCloseQuickNav,
  onCreateEvent,
  onLogout,
  onOpenCalendarManagement,
  onOpenSearch,
  onOpenSettings,
  onQuickNavOpenChange,
  onSidebarOpenChange,
  prefetchRange,
  user,
}: {
  getCachedEventsForRange?: (range: {
    start: Date;
    end: Date;
  }) => CalendarEvent[] | undefined;
  isQuickNavOpen: boolean;
  isSidebarOpen: boolean;
  onCloseQuickNav: () => void;
  onCreateEvent: () => void;
  onLogout?: () => void;
  onOpenCalendarManagement?: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onQuickNavOpenChange: (open: boolean) => void;
  onSidebarOpenChange: (open: boolean) => void;
  prefetchRange?: (range: { start: Date; end: Date }) => void;
  user?: User;
}) {
  return (
    <>
      <Drawer
        open={isQuickNavOpen}
        onOpenChange={onQuickNavOpenChange}
        direction="bottom"
      >
        <DrawerContent
          responsive
          responsiveHeight="85dvh"
          className="w-full p-0 sm:max-w-none overflow-hidden safe-area-inset-bottom"
        >
          <VisuallyHidden>
            <DrawerTitle>Quick Date Navigation</DrawerTitle>
            <DrawerDescription>
              Select a date from the mini calendar.
            </DrawerDescription>
          </VisuallyHidden>
          <div className="p-4 pt-6">
            <SidebarCalendar
              getCachedEventsForRange={getCachedEventsForRange}
              prefetchRange={prefetchRange}
              onDateSelect={onCloseQuickNav}
              isMobile={true}
            />
          </div>
        </DrawerContent>
      </Drawer>

      <Sheet open={isSidebarOpen} onOpenChange={onSidebarOpenChange}>
        <SheetContent
          side="left"
          showClose={false}
          style={{ width: SIDEBAR_WIDTH_MOBILE }}
          className="h-[100dvh] max-w-[92vw] rounded-none border-r border-border p-0 safe-area-inset-bottom"
        >
          <VisuallyHidden>
            <SheetTitle>Calendar Sidebar</SheetTitle>
            <SheetDescription>
              Access your calendars, mini calendar, and account settings
            </SheetDescription>
          </VisuallyHidden>
          <SidebarProvider defaultOpen={true}>
            <AppSidebar
              user={user}
              onLogout={onLogout}
              onOpenSettings={onOpenSettings}
              onOpenCalendarManagement={onOpenCalendarManagement}
              onOpenSearch={onOpenSearch}
              onCreateEvent={onCreateEvent}
              getCachedEventsForRange={getCachedEventsForRange}
              prefetchRange={prefetchRange}
              isMobile={true}
            />
          </SidebarProvider>
        </SheetContent>
      </Sheet>
    </>
  );
}
