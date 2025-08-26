// Loading messages for different contexts
export const LOADING_MESSAGES = {
    // Authentication related
    AUTH: [
        "Authenticating...",
        "Signing you in...",
        "Verifying credentials...",
        "Securing your session...",
        "Connecting to your account..."
    ],
    // General loading
    GENERAL: [
        "Loading...",
        "Getting things ready...",
        "Preparing your calendar...",
        "Setting up your workspace...",
        "Just a moment...",
        "Loading your data...",
        "Preparing your view...",
        "Almost ready...",
        "Syncing your information...",
        "Organizing your schedule..."
    ],
    // Calendar specific
    CALENDAR: [
        "Loading calendar...",
        "Syncing events...",
        "Updating your schedule...",
        "Fetching calendar data...",
        "Organizing your events...",
        "Loading your appointments...",
        "Refreshing calendar view...",
        "Syncing with calendars...",
        "Updating event details...",
        "Loading calendar settings..."
    ],
    // Settings and configuration
    SETTINGS: [
        "Loading settings...",
        "Configuring preferences...",
        "Updating your preferences...",
        "Loading configuration...",
        "Preparing settings...",
        "Syncing preferences...",
        "Customizing your experience...",
        "Loading user preferences...",
        "Configuring your workspace...",
        "Setting up your account..."
    ],
    // Data syncing
    SYNC: [
        "Syncing data...",
        "Updating information...",
        "Refreshing content...",
        "Syncing changes...",
        "Updating your calendar...",
        "Synchronizing events...",
        "Refreshing your data...",
        "Syncing with server...",
        "Updating local cache...",
        "Fetching latest changes..."
    ],
    // Initial app loading
    STARTUP: [
        "Starting Rocal...",
        "Initializing application...",
        "Loading your workspace...",
        "Preparing your calendar app...",
        "Setting up Rocal...",
        "Launching your calendar...",
        "Getting your calendar ready...",
        "Booting up your schedule...",
        "Initializing your workspace...",
        "Welcome to Rocal..."
    ],
    // Fun/engaging messages
    ENGAGING: [
        "Organizing your time...",
        "Crafting your perfect schedule...",
        "Polishing your calendar...",
        "Brewing your daily plan...",
        "Assembling your agenda...",
        "Fine-tuning your schedule...",
        "Optimizing your time...",
        "Curating your calendar...",
        "Building your day...",
        "Scheduling success..."
    ]
};
// Combined arrays for different loading contexts
export const COMBINED_MESSAGES = {
    PAGE_LOAD: [...LOADING_MESSAGES.STARTUP, ...LOADING_MESSAGES.GENERAL],
    AUTH_FLOW: [...LOADING_MESSAGES.AUTH, ...LOADING_MESSAGES.GENERAL],
    CALENDAR_LOAD: [...LOADING_MESSAGES.CALENDAR, ...LOADING_MESSAGES.SYNC],
    SETTINGS_LOAD: [...LOADING_MESSAGES.SETTINGS, ...LOADING_MESSAGES.GENERAL],
    DATA_SYNC: [...LOADING_MESSAGES.SYNC, ...LOADING_MESSAGES.CALENDAR],
    ENGAGING_MIX: [
        ...LOADING_MESSAGES.ENGAGING,
        ...LOADING_MESSAGES.GENERAL.slice(0, 3),
        ...LOADING_MESSAGES.CALENDAR.slice(0, 3)
    ]
};
// Helper function to get a random message from an array
export function getRandomMessage(messages) {
    if (messages.length === 0) {
        return "Loading..."; // Fallback message
    }
    return messages[Math.floor(Math.random() * messages.length)] || "Loading...";
}
// Helper function to get a message by context
export function getLoadingMessage(context) {
    return getRandomMessage(COMBINED_MESSAGES[context]);
}
// Message cycling configuration
export const MESSAGE_CYCLE_CONFIG = {
    // How often to change messages (in milliseconds)
    CYCLE_INTERVAL: 2000, // 2 seconds
    // Minimum time before first message change
    INITIAL_DELAY: 1000, // 1 second
    // Animation duration for message transitions
    TRANSITION_DURATION: 300, // 0.3 seconds
};
