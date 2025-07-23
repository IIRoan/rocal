"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { useSettings } from "@/hooks/use-settings";
import { useCalendarData } from "@/hooks/use-calendar-data";
import type { UserSettings, UpdateSettingsRequest } from "@/lib/types/calendar";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@workspace/ui/components/ui/drawer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { Button } from "@workspace/ui/components/ui/button";
import { Switch } from "@workspace/ui/components/ui/switch";
import { Separator } from "@workspace/ui/components/ui/separator";
import { Badge } from "@workspace/ui/components/ui/badge";
import {
  AlertCircle,
  Check,
  Clock,
  Bell,
  Eye,
  Calendar,
  RefreshCw,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@workspace/ui/components/ui/alert";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

const WORKING_DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

function formatTimeFromMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function parseTimeToMinutes(timeString: string): number {
  const [hours, minutes] = timeString.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

interface SettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDrawer({ open, onOpenChange }: SettingsDrawerProps) {
  const { data: session } = useSession();
  const { calendars } = useCalendarData({ autoRefetch: true });

  const { settings, loading, error: settingsError, updateSettings, resetSettings } = useSettings();
  
  const [localSettings, setLocalSettings] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Sync settings to local state for editing
  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  // Show settings error if any
  useEffect(() => {
    if (settingsError) {
      setError(settingsError);
    }
  }, [settingsError]);

  const handleSave = async () => {
    if (!localSettings) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updateData: UpdateSettingsRequest = {
        theme: localSettings.theme,
        defaultView: localSettings.defaultView,
        weekStartDay: localSettings.weekStartDay,
        timezone: localSettings.timezone,
        timeFormat: localSettings.timeFormat,
        workingHoursStart: localSettings.workingHoursStart,
        workingHoursEnd: localSettings.workingHoursEnd,
        workingDays: localSettings.workingDays,
        emailNotifications: localSettings.emailNotifications,
        browserNotifications: localSettings.browserNotifications,
        reminderSound: localSettings.reminderSound,
        defaultReminder: localSettings.defaultReminder,
        defaultEventDuration: localSettings.defaultEventDuration,
        defaultCalendarId: localSettings.defaultCalendarId,
        compactView: localSettings.compactView,
        showWeekNumbers: localSettings.showWeekNumbers,
        showDeclinedEvents: localSettings.showDeclinedEvents,
      };

      await updateSettings(updateData);
      setSuccess("Settings saved successfully!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Are you sure you want to reset all settings to defaults?")) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await resetSettings();
      setSuccess("Settings reset to defaults!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to reset settings");
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) => {
    if (localSettings) {
      setLocalSettings({ ...localSettings, [key]: value });
    }
  };

  if (loading) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p>Loading settings...</p>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  if (!localSettings) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <div className="flex items-center justify-center min-h-[400px] p-4">
            <Alert className="max-w-md">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to load settings. Please try refreshing the page.
              </AlertDescription>
            </Alert>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  const workingDaysList = JSON.parse(localSettings.workingDays) as number[];

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="max-w-lg w-full overflow-y-auto">
        <DrawerHeader className="flex flex-row items-center justify-between">
          <div>
            <DrawerTitle>Settings</DrawerTitle>
            <DrawerDescription>
              Customize your calendar preferences
            </DrawerDescription>
          </div>
          <DrawerClose asChild>
            <Button variant="ghost" size="icon">
              <X className="h-4 w-4" />
            </Button>
          </DrawerClose>
        </DrawerHeader>

        <div className="px-4 space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-200 bg-green-50">
              <Check className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                {success}
              </AlertDescription>
            </Alert>
          )}

          {/* Appearance Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="h-4 w-4" />
                Appearance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="theme">Theme</Label>
                  <Select
                    value={localSettings.theme}
                    onValueChange={(value: "light" | "dark" | "system") =>
                      updateSetting("theme", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="defaultView">Default View</Label>
                  <Select
                    value={localSettings.defaultView}
                    onValueChange={(value: "month" | "week" | "day" | "agenda") =>
                      updateSetting("defaultView", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">Month</SelectItem>
                      <SelectItem value="week">Week</SelectItem>
                      <SelectItem value="day">Day</SelectItem>
                      <SelectItem value="agenda">Agenda</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="weekStartDay">Week Starts On</Label>
                  <Select
                    value={localSettings.weekStartDay.toString()}
                    onValueChange={(value) =>
                      updateSetting("weekStartDay", parseInt(value))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Sunday</SelectItem>
                      <SelectItem value="1">Monday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Compact View</Label>
                    <p className="text-xs text-muted-foreground">
                      Show more events in less space
                    </p>
                  </div>
                  <Switch
                    checked={localSettings.compactView}
                    onCheckedChange={(checked) =>
                      updateSetting("compactView", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Show Week Numbers</Label>
                    <p className="text-xs text-muted-foreground">
                      Display week numbers in month view
                    </p>
                  </div>
                  <Switch
                    checked={localSettings.showWeekNumbers}
                    onCheckedChange={(checked) =>
                      updateSetting("showWeekNumbers", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Show Declined Events</Label>
                    <p className="text-xs text-muted-foreground">
                      Show events you've declined
                    </p>
                  </div>
                  <Switch
                    checked={localSettings.showDeclinedEvents}
                    onCheckedChange={(checked) =>
                      updateSetting("showDeclinedEvents", checked)
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Time & Regional Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" />
                Time & Region
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select
                    value={localSettings.timezone}
                    onValueChange={(value) => updateSetting("timezone", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timeFormat">Time Format</Label>
                  <Select
                    value={localSettings.timeFormat}
                    onValueChange={(value: "12h" | "24h") =>
                      updateSetting("timeFormat", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12h">12 Hour (1:00 PM)</SelectItem>
                      <SelectItem value="24h">24 Hour (13:00)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Working Hours</Label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Set your typical working hours
                  </p>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="workStart">Start Time</Label>
                      <Input
                        type="time"
                        value={formatTimeFromMinutes(localSettings.workingHoursStart)}
                        onChange={(e) =>
                          updateSetting(
                            "workingHoursStart",
                            parseTimeToMinutes(e.target.value)
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="workEnd">End Time</Label>
                      <Input
                        type="time"
                        value={formatTimeFromMinutes(localSettings.workingHoursEnd)}
                        onChange={(e) =>
                          updateSetting(
                            "workingHoursEnd",
                            parseTimeToMinutes(e.target.value)
                          )
                        }
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Working Days</Label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Select your typical working days
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {WORKING_DAYS.map((day) => (
                      <Badge
                        key={day.value}
                        variant={
                          workingDaysList.includes(day.value)
                            ? "default"
                            : "outline"
                        }
                        className="cursor-pointer text-xs"
                        onClick={() => {
                          const newWorkingDays = workingDaysList.includes(
                            day.value
                          )
                            ? workingDaysList.filter((d) => d !== day.value)
                            : [...workingDaysList, day.value].sort();
                          updateSetting(
                            "workingDays",
                            JSON.stringify(newWorkingDays)
                          );
                        }}
                      >
                        {day.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Email Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Receive event reminders via email
                    </p>
                  </div>
                  <Switch
                    checked={localSettings.emailNotifications}
                    onCheckedChange={(checked) =>
                      updateSetting("emailNotifications", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Browser Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Show notifications in your browser
                    </p>
                  </div>
                  <Switch
                    checked={localSettings.browserNotifications}
                    onCheckedChange={(checked) =>
                      updateSetting("browserNotifications", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Notification Sound</Label>
                    <p className="text-xs text-muted-foreground">
                      Play sound with notifications
                    </p>
                  </div>
                  <Switch
                    checked={localSettings.reminderSound}
                    onCheckedChange={(checked) =>
                      updateSetting("reminderSound", checked)
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Default Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4" />
                Event Defaults
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultReminder">
                    Default Reminder (minutes)
                  </Label>
                  <Input
                    type="number"
                    value={localSettings.defaultReminder || ""}
                    onChange={(e) =>
                      updateSetting(
                        "defaultReminder",
                        e.target.value ? parseInt(e.target.value) : null
                      )
                    }
                    placeholder="No default reminder"
                    min="1"
                    max="43200"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty for no default reminder
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="defaultDuration">
                    Default Event Duration (minutes)
                  </Label>
                  <Input
                    type="number"
                    value={localSettings.defaultEventDuration}
                    onChange={(e) =>
                      updateSetting(
                        "defaultEventDuration",
                        parseInt(e.target.value) || 60
                      )
                    }
                    min="1"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="defaultCalendar">Default Calendar</Label>
                  <Select
                    value={localSettings.defaultCalendarId || "none"}
                    onValueChange={(value) =>
                      updateSetting("defaultCalendarId", value === "none" ? null : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No default calendar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No default calendar</SelectItem>
                      {calendars.map((calendar) => (
                        <SelectItem key={calendar.id} value={calendar.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded"
                              style={{ backgroundColor: calendar.color }}
                            />
                            {calendar.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <DrawerFooter className="flex flex-row gap-2">
          <Button variant="outline" onClick={handleReset} disabled={saving} size="sm">
            Reset
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}