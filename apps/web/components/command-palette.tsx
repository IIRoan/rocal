"use client";

import { useState, useEffect } from "react";
import { useSettings } from "@/hooks/use-settings";
import { useCalendarData } from "@/hooks/use-calendar-data";
import { authClient } from "@/lib/auth-client";
import type { UserSettings, UpdateSettingsRequest } from "@/lib/types/calendar";
import {
  CommandDialog,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandInput,
} from "@workspace/ui/components/navigation/command";
import { Switch } from "@workspace/ui/components/ui/switch";
import {
  Settings,
  Monitor,
  Sun,
  Moon,
  Clock,
  Globe,
  Bell,
  Calendar,
  Eye,
  User,
  Shield,
  Mail,
  Palette,
  Layout,
  Volume2,
  RotateCcw,
  ChevronRight,
  Check,
  RefreshCw,
  ArrowLeft,
  X,
  Key,
  Plus,
  Trash2,
  Edit2,
  Smartphone,
  Usb,
  AlertCircle,
} from "lucide-react";

const TIMEZONE_GROUPS = {
  "Popular": [
    { value: "UTC", label: "UTC (Coordinated Universal Time)" },
    { value: "America/New_York", label: "Eastern Time (New York)" },
    { value: "America/Chicago", label: "Central Time (Chicago)" },
    { value: "America/Denver", label: "Mountain Time (Denver)" },
    { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
    { value: "Europe/London", label: "London" },
    { value: "Asia/Tokyo", label: "Tokyo" },
  ],
  "Americas": [
    { value: "America/Anchorage", label: "Anchorage" },
    { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires" },
    { value: "America/Bogota", label: "Bogotá" },
    { value: "America/Caracas", label: "Caracas" },
    { value: "America/Guatemala", label: "Guatemala City" },
    { value: "America/Havana", label: "Havana" },
    { value: "America/Lima", label: "Lima" },
    { value: "America/Mexico_City", label: "Mexico City" },
    { value: "America/Montevideo", label: "Montevideo" },
    { value: "America/Santiago", label: "Santiago" },
    { value: "America/Sao_Paulo", label: "São Paulo" },
    { value: "America/Toronto", label: "Toronto" },
    { value: "America/Vancouver", label: "Vancouver" },
  ],
  "Europe & Africa": [
    { value: "Europe/Amsterdam", label: "Amsterdam" },
    { value: "Europe/Berlin", label: "Berlin" },
    { value: "Europe/Brussels", label: "Brussels" },
    { value: "Europe/Dublin", label: "Dublin" },
    { value: "Europe/Helsinki", label: "Helsinki" },
    { value: "Europe/Istanbul", label: "Istanbul" },
    { value: "Europe/Madrid", label: "Madrid" },
    { value: "Europe/Moscow", label: "Moscow" },
    { value: "Europe/Paris", label: "Paris" },
    { value: "Europe/Rome", label: "Rome" },
    { value: "Europe/Stockholm", label: "Stockholm" },
    { value: "Europe/Vienna", label: "Vienna" },
    { value: "Europe/Zurich", label: "Zurich" },
    { value: "Africa/Cairo", label: "Cairo" },
    { value: "Africa/Johannesburg", label: "Johannesburg" },
    { value: "Africa/Lagos", label: "Lagos" },
  ],
  "Asia & Pacific": [
    { value: "Asia/Bangkok", label: "Bangkok" },
    { value: "Asia/Beijing", label: "Beijing" },
    { value: "Asia/Calcutta", label: "Mumbai" },
    { value: "Asia/Dubai", label: "Dubai" },
    { value: "Asia/Hong_Kong", label: "Hong Kong" },
    { value: "Asia/Jakarta", label: "Jakarta" },
    { value: "Asia/Karachi", label: "Karachi" },
    { value: "Asia/Seoul", label: "Seoul" },
    { value: "Asia/Shanghai", label: "Shanghai" },
    { value: "Asia/Singapore", label: "Singapore" },
    { value: "Asia/Taipei", label: "Taipei" },
    { value: "Asia/Tehran", label: "Tehran" },
    { value: "Australia/Adelaide", label: "Adelaide" },
    { value: "Australia/Brisbane", label: "Brisbane" },
    { value: "Australia/Melbourne", label: "Melbourne" },
    { value: "Australia/Perth", label: "Perth" },
    { value: "Australia/Sydney", label: "Sydney" },
    { value: "Pacific/Auckland", label: "Auckland" },
    { value: "Pacific/Fiji", label: "Fiji" },
    { value: "Pacific/Honolulu", label: "Honolulu" },
  ],
};

const ALL_TIMEZONES = Object.values(TIMEZONE_GROUPS).flat();

const WORKING_DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PaletteView = 
  | "main" 
  | "appearance" 
  | "time-region" 
  | "timezone" 
  | "notifications" 
  | "calendar-defaults" 
  | "account" 
  | "security"
  | "passkeys";

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { calendars } = useCalendarData({ autoRefetch: true });
  const {
    settings,
    loading,
    updateSettings,
    resetSettings,
  } = useSettings();

  const [currentView, setCurrentView] = useState<PaletteView>("main");
  const [localSettings, setLocalSettings] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState("");

  // Passkey-related state
  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeySuccess, setPasskeySuccess] = useState<string | null>(null);
  const [showAddPasskey, setShowAddPasskey] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");
  const [passkeyType, setPasskeyType] = useState<"platform" | "cross-platform" | undefined>(undefined);

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!open) {
      setCurrentView("main");
      setShowResetConfirm(false);
    }
  }, [open]);

  useEffect(() => {
    setShowResetConfirm(false);
    setTimezoneSearch("");
  }, [currentView]);

  // Load passkeys when security view is opened
  useEffect(() => {
    if (currentView === "security" || currentView === "passkeys") {
      loadPasskeys();
    }
  }, [currentView]);

  const updateSetting = async <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => {
    if (!localSettings || saving) return;
    
    // Update local state immediately
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    
    // Save to backend immediately
    setSaving(true);
    try {
      const updateData: UpdateSettingsRequest = {
        theme: newSettings.theme,
        defaultView: newSettings.defaultView,
        weekStartDay: newSettings.weekStartDay,
        timezone: newSettings.timezone,
        timeFormat: newSettings.timeFormat,
        workingHoursStart: newSettings.workingHoursStart,
        workingHoursEnd: newSettings.workingHoursEnd,
        workingDays: newSettings.workingDays,
        emailNotifications: newSettings.emailNotifications,
        browserNotifications: newSettings.browserNotifications,
        reminderSound: newSettings.reminderSound,
        defaultReminder: newSettings.defaultReminder,
        defaultEventDuration: newSettings.defaultEventDuration,
        defaultCalendarId: newSettings.defaultCalendarId,
        compactView: newSettings.compactView,
        showWeekNumbers: newSettings.showWeekNumbers,
        showDeclinedEvents: newSettings.showDeclinedEvents,
      };

      await updateSettings(updateData);
    } catch (err: any) {
      console.error("Failed to save settings:", err);
      // Revert to original settings on error
      setLocalSettings(localSettings);
    } finally {
      setSaving(false);
    }
  };


  const handleReset = async () => {
    setSaving(true);
    try {
      await resetSettings();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Failed to reset settings:", err);
    } finally {
      setSaving(false);
    }
  };

  const navigationItems = [
    {
      id: "appearance",
      label: "Appearance",
      icon: Palette,
      description: "Theme and layout settings",
    },
    {
      id: "time-region",
      label: "Time & Region",
      icon: Globe,
      description: "Timezone and format preferences",
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: Bell,
      description: "Notification preferences",
    },
    {
      id: "calendar-defaults",
      label: "Calendar Defaults",
      icon: Calendar,
      description: "Default event settings",
    },
    {
      id: "account",
      label: "Account",
      icon: User,
      description: "Account information",
    },
    {
      id: "security",
      label: "Security",
      icon: Shield,
      description: "Security settings",
    },
  ];

  if (loading || !localSettings) {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading settings...</p>
          </div>
        </div>
      </CommandDialog>
    );
  }

  const workingDaysList = JSON.parse(localSettings.workingDays) as number[];

  // Passkey utility functions
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case "platform":
        return Smartphone;
      case "cross-platform":
        return Usb;
      default:
        return Key;
    }
  };

  const getDeviceLabel = (deviceType: string) => {
    switch (deviceType) {
      case "platform":
        return "Platform";
      case "cross-platform":
        return "Security Key";
      default:
        return "Unknown";
    }
  };

  const loadPasskeys = async () => {
    try {
      setPasskeyLoading(true);
      setPasskeyError(null);
      const { data, error } = await authClient.passkey.listUserPasskeys();
      if (error) {
        throw new Error(error.message || "Failed to load passkeys");
      }
      setPasskeys(data || []);
    } catch (err: any) {
      setPasskeyError(err.message || "Failed to load passkeys");
    } finally {
      setPasskeyLoading(false);
    }
  };

  const addPasskey = async () => {
    if (!passkeyName.trim()) {
      setPasskeyError("Please enter a name for your passkey");
      return;
    }

    try {
      setPasskeyLoading(true);
      setPasskeyError(null);
      setPasskeySuccess(null);

      const addOptions: any = {
        name: passkeyName.trim(),
      };

      if (passkeyType) {
        addOptions.authenticatorAttachment = passkeyType;
      }

      const { data, error } = await authClient.passkey.addPasskey(addOptions);
      
      if (error) {
        throw new Error(error.message || "Failed to add passkey");
      }

      setPasskeySuccess("Passkey added successfully!");
      setShowAddPasskey(false);
      setPasskeyName("");
      setPasskeyType(undefined);
      await loadPasskeys();
      
      setTimeout(() => setPasskeySuccess(null), 3000);
    } catch (err: any) {
      setPasskeyError(err.message || "Failed to add passkey");
    } finally {
      setPasskeyLoading(false);
    }
  };

  const deletePasskey = async (id: string) => {
    try {
      setPasskeyError(null);
      setPasskeySuccess(null);

      const { error } = await authClient.passkey.deletePasskey({ id });
      
      if (error) {
        throw new Error(error.message || "Failed to delete passkey");
      }

      setPasskeySuccess("Passkey deleted successfully!");
      await loadPasskeys();
      
      setTimeout(() => setPasskeySuccess(null), 3000);
    } catch (err: any) {
      setPasskeyError(err.message || "Failed to delete passkey");
    }
  };

  if (currentView === "main") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Settings</h2>
        </div>
        <div className="bg-muted/30 border-b border-border focus-within:ring-0">
          <CommandInput placeholder="Search settings..." className="border-none bg-transparent focus:ring-0 focus:outline-none" />
        </div>
        <CommandList>
          <CommandGroup heading="Categories">
            {navigationItems.map((item) => (
              <CommandItem
                key={item.id}
                onSelect={() => setCurrentView(item.id as PaletteView)}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30 border-b border-border/30 last:border-b-0"
              >
                <item.icon className="mr-3 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{item.label}</span>
                  <span className="text-xs text-muted-foreground/80">{item.description}</span>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60" />
              </CommandItem>
            ))}
          </CommandGroup>

        </CommandList>
      </CommandDialog>
    );
  }

  if (currentView === "appearance") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button 
            onClick={() => setCurrentView("main")}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
        </div>
        <CommandList>
          <CommandGroup heading="Theme">
            <CommandItem 
              onSelect={() => updateSetting("theme", "light")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Sun className="mr-3 h-4 w-4 text-amber-500" />
              <span className="text-foreground">Light Theme</span>
              {localSettings.theme === "light" && <Check className="ml-auto h-4 w-4 text-primary" />}
            </CommandItem>
            <CommandItem 
              onSelect={() => updateSetting("theme", "dark")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Moon className="mr-3 h-4 w-4 text-slate-400" />
              <span className="text-foreground">Dark Theme</span>
              {localSettings.theme === "dark" && <Check className="ml-auto h-4 w-4 text-primary" />}
            </CommandItem>
            <CommandItem 
              onSelect={() => updateSetting("theme", "system")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Monitor className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">System Theme</span>
              {localSettings.theme === "system" && <Check className="ml-auto h-4 w-4 text-primary" />}
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Default View">
            <CommandItem 
              onSelect={() => updateSetting("defaultView", "month")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Layout className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">Month View</span>
              {localSettings.defaultView === "month" && <Check className="ml-auto h-4 w-4 text-primary" />}
            </CommandItem>
            <CommandItem 
              onSelect={() => updateSetting("defaultView", "week")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Layout className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">Week View</span>
              {localSettings.defaultView === "week" && <Check className="ml-auto h-4 w-4 text-primary" />}
            </CommandItem>
            <CommandItem 
              onSelect={() => updateSetting("defaultView", "day")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Layout className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">Day View</span>
              {localSettings.defaultView === "day" && <Check className="ml-auto h-4 w-4 text-primary" />}
            </CommandItem>
            <CommandItem 
              onSelect={() => updateSetting("defaultView", "agenda")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Layout className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">Agenda View</span>
              {localSettings.defaultView === "agenda" && <Check className="ml-auto h-4 w-4 text-primary" />}
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Display Options">
            <CommandItem 
              onSelect={() => updateSetting("compactView", !localSettings.compactView)}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Eye className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">Compact View</span>
              <Switch checked={localSettings.compactView} className="ml-auto" />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    );
  }

  if (currentView === "notifications") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button 
            onClick={() => setCurrentView("main")}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h2 className="text-lg font-semibold text-foreground">Notifications</h2>
        </div>
        <CommandList>
          <CommandGroup heading="Email Settings">
            <CommandItem 
              onSelect={() => updateSetting("emailNotifications", !localSettings.emailNotifications)}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Mail className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">Email Notifications</span>
              <Switch checked={localSettings.emailNotifications} className="ml-auto" />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    );
  }

  if (currentView === "time-region") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button 
            onClick={() => setCurrentView("main")}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h2 className="text-lg font-semibold text-foreground">Time & Region</h2>
        </div>
        <CommandList>
          <CommandGroup heading="Timezone">
            <CommandItem 
              onSelect={() => setCurrentView("timezone")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Globe className="mr-3 h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-foreground">Timezone</span>
                <span className="text-xs text-muted-foreground">
                  {ALL_TIMEZONES.find(tz => tz.value === localSettings.timezone)?.label || localSettings.timezone}
                </span>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60" />
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Time Format">
            <CommandItem 
              onSelect={() => updateSetting("timeFormat", "12h")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Clock className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">12 Hour (1:00 PM)</span>
              {localSettings.timeFormat === "12h" && <Check className="ml-auto h-4 w-4 text-primary" />}
            </CommandItem>
            <CommandItem 
              onSelect={() => updateSetting("timeFormat", "24h")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Clock className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">24 Hour (13:00)</span>
              {localSettings.timeFormat === "24h" && <Check className="ml-auto h-4 w-4 text-primary" />}
            </CommandItem>
          </CommandGroup>

        </CommandList>
      </CommandDialog>
    );
  }

  if (currentView === "timezone") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button 
            onClick={() => setCurrentView("time-region")}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h2 className="text-lg font-semibold text-foreground">Timezone</h2>
        </div>
        <div className="bg-muted/30 border-b border-border focus-within:ring-0">
          <input
            type="text"
            placeholder="Search timezones..."
            value={timezoneSearch}
            onChange={(e) => setTimezoneSearch(e.target.value)}
            className="w-full px-4 py-3 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <CommandList>
          {timezoneSearch ? (
            <CommandGroup heading="Search Results">
              {ALL_TIMEZONES
                .filter((tz) => 
                  tz.label.toLowerCase().includes(timezoneSearch.toLowerCase()) ||
                  tz.value.toLowerCase().includes(timezoneSearch.toLowerCase())
                )
                .slice(0, 20)
                .map((tz) => (
                  <CommandItem
                    key={tz.value}
                    onSelect={() => {
                      updateSetting("timezone", tz.value);
                      setTimezoneSearch("");
                      setCurrentView("time-region");
                    }}
                    className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
                  >
                    <Globe className="mr-3 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="text-foreground">{tz.label}</span>
                      <span className="text-xs text-muted-foreground">{tz.value}</span>
                    </div>
                    {localSettings.timezone === tz.value && <Check className="ml-auto h-4 w-4 text-primary" />}
                  </CommandItem>
                ))
              }
            </CommandGroup>
          ) : (
            Object.entries(TIMEZONE_GROUPS).map(([groupName, timezones]) => (
              <CommandGroup key={groupName} heading={groupName}>
                {timezones.map((tz) => (
                  <CommandItem
                    key={tz.value}
                    onSelect={() => {
                      updateSetting("timezone", tz.value);
                      setCurrentView("time-region");
                    }}
                    className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
                  >
                    <Globe className="mr-3 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="text-foreground">{tz.label}</span>
                      <span className="text-xs text-muted-foreground">{tz.value}</span>
                    </div>
                    {localSettings.timezone === tz.value && <Check className="ml-auto h-4 w-4 text-primary" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))
          )}
        </CommandList>
      </CommandDialog>
    );
  }

  if (currentView === "calendar-defaults") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button 
            onClick={() => setCurrentView("main")}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h2 className="text-lg font-semibold text-foreground">Calendar Defaults</h2>
        </div>
        <CommandList>
          <CommandGroup heading="Week Settings">
            {WORKING_DAYS.map((day) => (
              <CommandItem 
                key={day.value}
                onSelect={() => updateSetting("weekStartDay", day.value)}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Calendar className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">Week starts on {day.label}</span>
                {localSettings.weekStartDay === day.value && <Check className="ml-auto h-4 w-4 text-primary" />}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading="Working Days">
            {WORKING_DAYS.map((day) => (
              <CommandItem 
                key={day.value}
                onSelect={() => {
                  const currentWorkingDays = [...workingDaysList];
                  const dayIndex = currentWorkingDays.indexOf(day.value);
                  if (dayIndex > -1) {
                    currentWorkingDays.splice(dayIndex, 1);
                  } else {
                    currentWorkingDays.push(day.value);
                  }
                  updateSetting("workingDays", JSON.stringify(currentWorkingDays.sort()));
                }}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Calendar className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">{day.label}</span>
                {workingDaysList.includes(day.value) && <Check className="ml-auto h-4 w-4 text-primary" />}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    );
  }

  if (currentView === "account") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button 
            onClick={() => setCurrentView("main")}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h2 className="text-lg font-semibold text-foreground">Account</h2>
        </div>
        <CommandList>
          {!showResetConfirm ? (
            <CommandGroup heading="Danger Zone">
              <CommandItem 
                onSelect={() => setShowResetConfirm(true)}
                disabled={saving}
                className="px-4 py-3 hover:bg-destructive/10 data-[selected=true]:bg-destructive/15 text-destructive"
              >
                <RotateCcw className="mr-3 h-4 w-4" />
                <span>Reset to Defaults</span>
              </CommandItem>
            </CommandGroup>
          ) : (
            <CommandGroup heading="Confirm Reset">
              <div className="px-4 py-3 text-sm text-muted-foreground">
                This will reset all your settings to their default values. This action cannot be undone.
              </div>
              <CommandItem 
                onSelect={() => {
                  handleReset();
                  setShowResetConfirm(false);
                }}
                disabled={saving}
                className="px-4 py-3 hover:bg-destructive/20 data-[selected=true]:bg-destructive/25 text-destructive"
              >
                <Check className="mr-3 h-4 w-4" />
                <span>Yes, Reset Everything</span>
              </CommandItem>
              <CommandItem 
                onSelect={() => setShowResetConfirm(false)}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <X className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">Cancel</span>
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    );
  }

  if (currentView === "security") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button 
            onClick={() => setCurrentView("main")}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h2 className="text-lg font-semibold text-foreground">Security</h2>
        </div>
        <CommandList>
          <CommandGroup heading="Authentication">
            <CommandItem 
              onSelect={() => setCurrentView("passkeys")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Key className="mr-3 h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-foreground">Passkeys</span>
                <span className="text-xs text-muted-foreground">
                  Manage passwordless authentication
                </span>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60" />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    );
  }

  if (currentView === "passkeys") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button 
            onClick={() => setCurrentView("security")}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h2 className="text-lg font-semibold text-foreground">Passkeys</h2>
        </div>
        <CommandList>
          {passkeyError && (
            <div className="px-4 py-3 mb-2">
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>{passkeyError}</span>
              </div>
            </div>
          )}

          {passkeySuccess && (
            <div className="px-4 py-3 mb-2">
              <div className="flex items-center gap-2 text-green-600 text-sm">
                <Check className="h-4 w-4" />
                <span>{passkeySuccess}</span>
              </div>
            </div>
          )}

          {!showAddPasskey ? (
            <CommandGroup heading="Actions">
              <CommandItem 
                onSelect={() => setShowAddPasskey(true)}
                disabled={passkeyLoading}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Plus className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">Add New Passkey</span>
              </CommandItem>
            </CommandGroup>
          ) : (
            <CommandGroup heading="Add New Passkey">
              <div className="px-4 py-3 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Passkey Name
                  </label>
                  <input
                    type="text"
                    value={passkeyName}
                    onChange={(e) => setPasskeyName(e.target.value)}
                    placeholder="e.g., iPhone Face ID, YubiKey"
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Authenticator Type (Optional)
                  </label>
                  <select
                    value={passkeyType || ""}
                    onChange={(e) => setPasskeyType(e.target.value as "platform" | "cross-platform" | undefined || undefined)}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="">Any (Recommended)</option>
                    <option value="platform">Platform (Face ID, Touch ID)</option>
                    <option value="cross-platform">Security Key (YubiKey, etc.)</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={addPasskey}
                    disabled={passkeyLoading || !passkeyName.trim()}
                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                  >
                    {passkeyLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin inline" />
                        Adding...
                      </>
                    ) : (
                      "Create Passkey"
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddPasskey(false);
                      setPasskeyName("");
                      setPasskeyType(undefined);
                      setPasskeyError(null);
                    }}
                    disabled={passkeyLoading}
                    className="px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </CommandGroup>
          )}

          {passkeyLoading && passkeys.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading passkeys...</p>
            </div>
          ) : passkeys.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Key className="h-8 w-8 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground mb-2">No passkeys found</p>
              <p className="text-xs text-muted-foreground">
                Add your first passkey to enable passwordless authentication
              </p>
            </div>
          ) : (
            <CommandGroup heading="Your Passkeys">
              {passkeys.map((passkey) => {
                const DeviceIcon = getDeviceIcon(passkey.deviceType);
                return (
                  <div key={passkey.id} className="px-4 py-3 border-b border-border/30 last:border-b-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-md bg-muted">
                          <DeviceIcon className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {passkey.name}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {getDeviceLabel(passkey.deviceType)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Added {new Date(passkey.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => deletePasskey(passkey.id)}
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive/70 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    );
  }

  // Other views fallback
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
        <button 
          onClick={() => setCurrentView("main")}
          className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <h2 className="text-lg font-semibold text-foreground">Settings</h2>
      </div>
      <CommandList>
        <CommandGroup heading="Status">
          <CommandItem disabled className="px-4 py-3 opacity-60">
            <Settings className="mr-3 h-4 w-4 text-muted-foreground" />
            <span className="text-foreground">This section is coming soon</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}