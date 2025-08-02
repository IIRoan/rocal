"use client";

import { useState } from "react";
import { calendarApiService } from "@/lib/calendar-api-service";
import { useCalendarData } from "@/hooks/use-calendar-data";
import type {
  Calendar,
  CreateCalendarRequest,
  UpdateCalendarRequest,
  CalendarDeleteAction,
} from "@/lib/types/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@workspace/ui/components/ui/dialog";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import { Switch } from "@workspace/ui/components/ui/switch";
import { Badge } from "@workspace/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/ui/card";
import { Alert, AlertDescription } from "@workspace/ui/components/ui/alert";
import {
  Plus,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Star,
  AlertTriangle,
  MoveRight,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

const COLOR_OPTIONS = [
  { value: "blue", label: "Blue", color: "#3b82f6" },
  { value: "orange", label: "Orange", color: "#f97316" },
  { value: "violet", label: "Violet", color: "#8b5cf6" },
  { value: "rose", label: "Rose", color: "#f43f5e" },
  { value: "emerald", label: "Emerald", color: "#10b981" },
];

interface CalendarManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CalendarManagement({
  open,
  onOpenChange,
}: CalendarManagementProps) {
  const { calendars, refetchCalendars, updateCalendar, createCalendar } =
    useCalendarData();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null);
  const [deletingCalendar, setDeletingCalendar] = useState<Calendar | null>(
    null,
  );
  const [deleteAction, setDeleteAction] =
    useState<CalendarDeleteAction>("prevent");
  const [targetCalendarId, setTargetCalendarId] = useState<string>("");

  const [newCalendar, setNewCalendar] = useState({
    name: "",
    color: "blue" as const,
    isDefault: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleCreateCalendar = async () => {
    if (!newCalendar.name.trim()) {
      setError("Calendar name is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const calendarData: CreateCalendarRequest = {
        name: newCalendar.name.trim(),
        color: newCalendar.color,
        isDefault: newCalendar.isDefault,
      };

      await createCalendar(calendarData);
      setNewCalendar({ name: "", color: "blue", isDefault: false });
      setShowCreateForm(false);
      setSuccess("Calendar created successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to create calendar");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCalendar = async (
    calendar: Calendar,
    updates: Partial<UpdateCalendarRequest>,
  ) => {
    setLoading(true);
    setError(null);

    try {
      await updateCalendar(calendar.id, updates);
      setSuccess("Calendar updated successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to update calendar");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCalendar = async () => {
    if (!deletingCalendar) return;

    setLoading(true);
    setError(null);

    try {
      await calendarApiService.deleteCalendarAdvanced(
        deletingCalendar.id,
        deleteAction,
        targetCalendarId || undefined,
      );

      await refetchCalendars();
      setDeletingCalendar(null);
      setDeleteAction("prevent");
      setTargetCalendarId("");
      setSuccess("Calendar deleted successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to delete calendar");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleVisibility = (calendar: Calendar) => {
    handleUpdateCalendar(calendar, { isVisible: !calendar.isVisible });
  };

  const handleSetDefault = (calendar: Calendar) => {
    handleUpdateCalendar(calendar, { isDefault: true });
  };

  const availableTargetCalendars = calendars.filter(
    (c) => c.id !== deletingCalendar?.id,
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Calendars</DialogTitle>
            <DialogDescription>
              Create, edit, and organize your calendars
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                {success}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            {/* Create New Calendar */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Create New Calendar</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCreateForm(!showCreateForm)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    New Calendar
                  </Button>
                </CardTitle>
              </CardHeader>
              {showCreateForm && (
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newCalendarName">Calendar Name</Label>
                    <Input
                      id="newCalendarName"
                      value={newCalendar.name}
                      onChange={(e) =>
                        setNewCalendar({ ...newCalendar, name: e.target.value })
                      }
                      placeholder="Enter calendar name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Color</Label>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_OPTIONS.map((colorOption) => (
                        <button
                          key={colorOption.value}
                          onClick={() =>
                            setNewCalendar({
                              ...newCalendar,
                              color: colorOption.value as any,
                            })
                          }
                          className={`w-8 h-8 rounded-full border-2 ${
                            newCalendar.color === colorOption.value
                              ? "border-gray-900 ring-2 ring-gray-300"
                              : "border-gray-300"
                          }`}
                          style={{ backgroundColor: colorOption.color }}
                          title={colorOption.label}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="newCalendarDefault"
                      checked={newCalendar.isDefault}
                      onCheckedChange={(checked) =>
                        setNewCalendar({ ...newCalendar, isDefault: checked })
                      }
                    />
                    <Label htmlFor="newCalendarDefault">
                      Set as default calendar
                    </Label>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleCreateCalendar} disabled={loading}>
                      Create Calendar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowCreateForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Existing Calendars */}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Your Calendars</h3>
              <div className="space-y-2">
                {calendars.map((calendar) => (
                  <Card key={calendar.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: calendar.color }}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {calendar.name}
                              </span>
                              {calendar.isDefault && (
                                <Badge variant="outline" className="text-xs">
                                  <Star className="h-3 w-3 mr-1" />
                                  Default
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {calendar.isVisible ? "Visible" : "Hidden"}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleVisibility(calendar)}
                            title={
                              calendar.isVisible
                                ? "Hide calendar"
                                : "Show calendar"
                            }
                          >
                            {calendar.isVisible ? (
                              <Eye className="h-4 w-4" />
                            ) : (
                              <EyeOff className="h-4 w-4" />
                            )}
                          </Button>

                          {!calendar.isDefault && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetDefault(calendar)}
                              title="Set as default calendar"
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingCalendar(calendar)}
                            title="Edit calendar"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingCalendar(calendar)}
                            title="Delete calendar"
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Calendar Dialog */}
      <Dialog
        open={!!editingCalendar}
        onOpenChange={(open) => !open && setEditingCalendar(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Calendar</DialogTitle>
          </DialogHeader>

          {editingCalendar && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editCalendarName">Calendar Name</Label>
                <Input
                  id="editCalendarName"
                  value={editingCalendar.name}
                  onChange={(e) =>
                    setEditingCalendar({
                      ...editingCalendar,
                      name: e.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map((colorOption) => (
                    <button
                      key={colorOption.value}
                      onClick={() =>
                        setEditingCalendar({
                          ...editingCalendar,
                          color: colorOption.value as any,
                        })
                      }
                      className={`w-8 h-8 rounded-full border-2 ${
                        editingCalendar.color === colorOption.value
                          ? "border-gray-900 ring-2 ring-gray-300"
                          : "border-gray-300"
                      }`}
                      style={{ backgroundColor: colorOption.color }}
                      title={colorOption.label}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCalendar(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingCalendar) {
                  handleUpdateCalendar(editingCalendar, {
                    name: editingCalendar.name,
                    color: editingCalendar.color,
                  });
                  setEditingCalendar(null);
                }
              }}
              disabled={loading}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Calendar Dialog */}
      <Dialog
        open={!!deletingCalendar}
        onOpenChange={(open) => !open && setDeletingCalendar(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Delete Calendar
            </DialogTitle>
            <DialogDescription>
              You're about to delete "{deletingCalendar?.name}". What would you
              like to do with existing events?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <input
                  type="radio"
                  id="prevent"
                  name="deleteAction"
                  value="prevent"
                  checked={deleteAction === "prevent"}
                  onChange={(e) =>
                    setDeleteAction(e.target.value as CalendarDeleteAction)
                  }
                  className="mt-1"
                />
                <div className="space-y-1">
                  <label
                    htmlFor="prevent"
                    className="font-medium cursor-pointer"
                  >
                    Prevent deletion (recommended)
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Don't delete if the calendar contains events
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <input
                  type="radio"
                  id="move_events"
                  name="deleteAction"
                  value="move_events"
                  checked={deleteAction === "move_events"}
                  onChange={(e) =>
                    setDeleteAction(e.target.value as CalendarDeleteAction)
                  }
                  className="mt-1"
                />
                <div className="space-y-1 flex-1">
                  <label
                    htmlFor="move_events"
                    className="font-medium cursor-pointer"
                  >
                    Move events to another calendar
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Transfer all events to a different calendar
                  </p>
                  {deleteAction === "move_events" && (
                    <Select
                      value={targetCalendarId}
                      onValueChange={setTargetCalendarId}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Select target calendar" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTargetCalendars.map((calendar) => (
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
                  )}
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <input
                  type="radio"
                  id="delete_events"
                  name="deleteAction"
                  value="delete_events"
                  checked={deleteAction === "delete_events"}
                  onChange={(e) =>
                    setDeleteAction(e.target.value as CalendarDeleteAction)
                  }
                  className="mt-1"
                />
                <div className="space-y-1">
                  <label
                    htmlFor="delete_events"
                    className="font-medium cursor-pointer text-red-600"
                  >
                    Delete calendar and all events
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete the calendar and all its events
                  </p>
                </div>
              </div>
            </div>

            {deleteAction === "move_events" && !targetCalendarId && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Please select a target calendar to move events to.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingCalendar(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteCalendar}
              disabled={
                loading || (deleteAction === "move_events" && !targetCalendarId)
              }
            >
              {loading ? "Deleting..." : "Delete Calendar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
