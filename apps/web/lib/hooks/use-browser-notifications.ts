import { useEffect, useCallback, useRef } from 'react';
import { browserNotificationService } from '../browser-notifications';
import { calendarApiService } from '../calendar-api-service';

/**
 * Custom hook for managing browser notifications
 */
export function useBrowserNotifications() {
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  /**
   * Request notification permission
   */
  const requestPermission = useCallback(async () => {
    try {
      const permission = await browserNotificationService.requestPermission();
      return permission === 'granted';
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return false;
    }
  }, []);

  /**
   * Check if notifications are supported and permitted
   */
  const isNotificationEnabled = useCallback(() => {
    return (
      browserNotificationService.isSupported() &&
      browserNotificationService.getPermissionStatus() === 'granted'
    );
  }, []);

  /**
   * Show a test notification
   */
  const showTestNotification = useCallback(async () => {
    try {
      await browserNotificationService.showTestNotification();
      return true;
    } catch (error) {
      console.error('Failed to show test notification:', error);
      return false;
    }
  }, []);

  /**
   * Poll for pending notifications from the server
   */
  const pollForNotifications = useCallback(async () => {
    if (!isNotificationEnabled() || isPollingRef.current) {
      return;
    }

    isPollingRef.current = true;

    try {
      const response = await calendarApiService.getPendingBrowserNotifications();
      
      if (response.success && response.notifications.length > 0) {
        // Display each pending notification
        for (const notification of response.notifications) {
          await browserNotificationService.showNotification(notification);
        }
        
        console.log(`✓ Displayed ${response.notifications.length} pending notifications`);
      }
    } catch (error) {
      console.error('Failed to poll for notifications:', error);
    } finally {
      isPollingRef.current = false;
    }
  }, [isNotificationEnabled]);

  /**
   * Start polling for notifications
   */
  const startPolling = useCallback((intervalMs: number = 30000) => {
    if (!isNotificationEnabled()) {
      console.warn('Cannot start notification polling: notifications not enabled');
      return;
    }

    // Clear existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Start new polling interval
    pollingIntervalRef.current = setInterval(pollForNotifications, intervalMs);
    
    // Poll immediately
    pollForNotifications();
    
    console.log(`✓ Started notification polling every ${intervalMs}ms`);
  }, [isNotificationEnabled, pollForNotifications]);

  /**
   * Stop polling for notifications
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      console.log('✓ Stopped notification polling');
    }
  }, []);

  /**
   * Initialize notification service and start polling if permission is granted
   */
  const initialize = useCallback(async () => {
    try {
      await browserNotificationService.initialize();
      
      if (isNotificationEnabled()) {
        startPolling();
      } else {
        console.log('Notifications not enabled - skipping auto-polling');
      }
    } catch (error) {
      console.error('Failed to initialize browser notifications:', error);
    }
  }, [isNotificationEnabled, startPolling]);

  // Initialize on mount and cleanup on unmount
  useEffect(() => {
    initialize();

    return () => {
      stopPolling();
    };
  }, [initialize, stopPolling]);

  return {
    isSupported: browserNotificationService.isSupported(),
    permission: browserNotificationService.getPermissionStatus(),
    isEnabled: isNotificationEnabled(),
    requestPermission,
    showTestNotification,
    pollForNotifications,
    startPolling,
    stopPolling,
    initialize,
  };
}