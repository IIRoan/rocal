/**
 * Service Worker for handling browser notifications
 */

self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(clients.claim());
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  
  event.notification.close();

  // Handle different actions
  if (event.action === 'view') {
    // Navigate to the event
    const eventId = event.notification.data?.eventId;
    if (eventId) {
      event.waitUntil(
        clients.openWindow(`/events/${eventId}`)
      );
    } else {
      event.waitUntil(
        clients.openWindow('/')
      );
    }
  } else if (event.action === 'dismiss') {
    // Just close the notification (already done above)
    console.log('Notification dismissed');
  } else {
    // Default action (clicking notification body)
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Handle notification close events
self.addEventListener('notificationclose', (event) => {
  console.log('Notification closed:', event.notification.tag);
});

// Handle background sync for offline notifications
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-notification-sync') {
    event.waitUntil(
      // Sync notifications when back online
      console.log('Background sync triggered for notifications')
    );
  }
});

// Handle push events (for future server-sent notifications)
self.addEventListener('push', (event) => {
  console.log('Push event received:', event);
  
  if (event.data) {
    try {
      const data = event.data.json();
      
      event.waitUntil(
        self.registration.showNotification(data.title, {
          body: data.body,
          icon: data.icon || '/favicon.ico',
          badge: data.badge || '/favicon.ico',
          tag: data.tag,
          data: data.data,
          requireInteraction: true
        })
      );
    } catch (error) {
      console.error('Error parsing push data:', error);
    }
  }
});