"use client";
import React from "react";
import { Button } from "@workspace/ui/components/ui/button";
import { Trash2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, } from "@workspace/ui/components/ui/dialog";
export function RecurringDeleteModal({ open, onOpenChange, eventTitle, onDeleteThis, onDeleteAll, loading = false, }) {
    return (<Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive"/>
            Delete Recurring Event
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              "{eventTitle}" is a recurring event.
            </p>
            <p className="text-sm text-muted-foreground">
              Would you like to delete just this occurrence or the entire series?
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            {onDeleteThis && (<Button variant="outline" onClick={() => {
                onDeleteThis();
            }} disabled={loading}>
                <Trash2 className="h-4 w-4 mr-2"/>
                {loading ? "Deleting..." : "Delete This Only"}
              </Button>)}
            <Button variant="destructive" onClick={() => {
            onDeleteAll();
        }} disabled={loading}>
              <Trash2 className="h-4 w-4 mr-2"/>
              {loading ? "Deleting..." : "Delete All"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>);
}
