/**
 * Browser Notifications Service
 * Handles browser notification permissions, registration, and display
 */

interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

export interface BrowserNotificationData {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag: string;
  data: {
    eventId: string;
    userId: string;
    type: 'reminder';
  };
}

export class BrowserNotificationService {
  private static instance: BrowserNotificationService;
  private registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

  private constructor() {}

  public static getInstance(): BrowserNotificationService {
    if (!BrowserNotificationService.instance) {
      BrowserNotificationService.instance = new BrowserNotificationService();
    }
    return BrowserNotificationService.instance;
  }

  /**
   * Check if browser notifications are supported
   */
  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return 'Notification' in window && 'serviceWorker' in navigator;
  }

  /**
   * Get current notification permission status
   */
  getPermissionStatus(): NotificationPermission {
    if (!this.isSupported() || typeof window === 'undefined') {
      return 'denied';
    }
    return Notification.permission;
  }

  /**
   * Request notification permission from the user
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      throw new Error('Browser notifications are not supported');
    }

    if (Notification.permission === 'granted') {
      return 'granted';
    }

    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return 'denied';
    }
  }

  /**
   * Register service worker for notifications
   */
  private async registerServiceWorker(): Promise<ServiceWorkerRegistration> {
    if (this.registrationPromise) {
      return this.registrationPromise;
    }

    if (typeof window === 'undefined' || !navigator.serviceWorker) {
      throw new Error('Service Worker not supported');
    }

    this.registrationPromise = navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    try {
      const registration = await this.registrationPromise;
      console.log('Service Worker registered successfully:', registration);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      throw error;
    }
  }

  /**
   * Initialize the notification service
   */
  async initialize(): Promise<void> {
    if (!this.isSupported()) {
      console.warn('Browser notifications are not supported in this browser');
      return;
    }

    try {
      await this.registerServiceWorker();
      console.log('Browser notification service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize browser notification service:', error);
    }
  }

  /**
   * Show a browser notification
   */
  async showNotification(data: BrowserNotificationData): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Browser notifications are not supported');
    }

    const permission = await this.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission denied');
    }

    try {
      const registration = await this.registerServiceWorker();
      
      const options: NotificationOptions & { actions?: NotificationAction[] } = {
        body: data.body,
        icon: data.icon || '/favicon.ico',
        badge: data.badge || '/favicon.ico',
        tag: data.tag,
        data: data.data,
        requireInteraction: true,
        actions: [
          {
            action: 'view',
            title: 'View Event',
            icon: '/icons/view.png'
          },
          {
            action: 'dismiss',
            title: 'Dismiss',
            icon: '/icons/dismiss.png'
          }
        ]
      };
      
      await registration.showNotification(data.title, options);

      console.log('✓ Browser notification shown:', data.title);
    } catch (error) {
      console.error('Failed to show notification:', error);
      throw error;
    }
  }

  /**
   * Test notification (for testing purposes)
   */
  async showTestNotification(): Promise<void> {
    const testData: BrowserNotificationData = {
      title: 'Test Notification',
      body: 'This is a test notification from your calendar app',
      tag: 'test-notification',
      data: {
        eventId: 'test',
        userId: 'test',
        type: 'reminder'
      }
    };

    await this.showNotification(testData);
  }

  /**
   * Setup WebSocket connection for real-time notifications
   */
  setupWebSocketConnection(userId: string): void {
    if (!this.isSupported() || typeof window === 'undefined') {
      return;
    }

    // For now, we'll simulate real-time notifications
    // In a production app, you'd establish a WebSocket connection to your server
    console.log(`Setting up WebSocket connection for user: ${userId}`);
    
    // Example WebSocket setup (commented out for now):
    // const ws = new WebSocket(`ws://localhost:3000/notifications/${userId}`);
    // ws.onmessage = async (event) => {
    //   const notificationData = JSON.parse(event.data);
    //   await this.showNotification(notificationData);
    // };
  }

  /**
   * Handle notification click events
   */
  handleNotificationClick(event: any): void {
    if (typeof window === 'undefined') return;
    
    event.notification.close();

    // Handle different actions
    if (event.action === 'view') {
      // Navigate to the event
      const eventId = event.notification.data?.eventId;
      if (eventId) {
        // In a real app, you'd navigate to the event details
        console.log('Navigate to event:', eventId);
        // Use window.open instead of clients.openWindow for browser context
        window.open(`/events/${eventId}`, '_blank');
      }
    } else if (event.action === 'dismiss') {
      // Just close the notification
      console.log('Notification dismissed');
    } else {
      // Default action (clicking notification body)
      window.open('/', '_blank');
    }
  }
}

// Create global instance
export const browserNotificationService = BrowserNotificationService.getInstance();

// Auto-initialize when the module is loaded
if (typeof window !== 'undefined') {
  browserNotificationService.initialize().catch(console.error);
}