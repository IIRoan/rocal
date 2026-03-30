# Mobile UI

This package contains mobile-specific UI components for the Rocal application.

## Components

### MobilePage

This component is a wrapper for all mobile pages. It handles safe areas to ensure that the content is not obscured by device notches or other system UI elements.

### MobileSidebar

This component is a swipe-to-open sidebar for mobile navigation. It reuses the navigation links from the web application.

### MobileCalendar

This component is a wrapper for the existing calendar component. It adds swipe gesture handling for navigating the calendar.

## Usage

These components are intended to be used in the `apps/web` application when it is running in a Capacitor container. They should not be used in the desktop web application.
