"use client";
import { cn } from "../../lib/utils";
import { Skeleton } from "./skeleton";
// Dashboard skeleton for the main layout
export function DashboardSkeleton({ className }) {
    return (<div className={cn("flex h-screen bg-background", className)}>
      {/* Sidebar skeleton */}
      <div className="hidden md:flex w-64 flex-col border-r border-border bg-sidebar animate-fade-in">
        {/* Header */}
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" variant="shimmer"/>
            <Skeleton className="h-5 w-20" variant="shimmer"/>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 p-4 space-y-6">
          {/* User section */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-2">
              <Skeleton className="h-8 w-8 rounded-full" variant="shimmer"/>
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-24" variant="shimmer"/>
                <Skeleton className="h-3 w-20" variant="shimmer"/>
              </div>
            </div>
          </div>

          {/* Calendar section */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-16" variant="shimmer"/>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (<div key={i} className="flex items-center gap-3 p-2 rounded">
                  <Skeleton className="h-3 w-3 rounded-full" variant="shimmer"/>
                  <Skeleton className="h-4 flex-1" variant="wave"/>
                  <Skeleton className="h-4 w-4" variant="shimmer"/>
                </div>))}
            </div>
          </div>

          {/* Categories section */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-20" variant="shimmer"/>
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (<div key={i} className="flex items-center gap-3 p-2 rounded">
                  <Skeleton className="h-3 w-3 rounded-full" variant="shimmer"/>
                  <Skeleton className="h-4 flex-1" variant="wave"/>
                </div>))}
            </div>
          </div>
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Skeleton className="h-8 w-8 rounded md:hidden" variant="shimmer"/>
              <div className="space-y-1">
                <Skeleton className="h-6 w-32" variant="shimmer"/>
                <Skeleton className="h-4 w-24" variant="shimmer"/>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-20" variant="shimmer"/>
              <Skeleton className="h-8 w-16" variant="shimmer"/>
              <Skeleton className="h-8 w-8 rounded" variant="shimmer"/>
            </div>
          </div>
        </div>

        {/* Calendar content */}
        <div className="flex-1 p-4">
          <Skeleton className="h-full w-full rounded-lg" variant="wave"/>
        </div>
      </div>
    </div>);
}
// Settings dialog skeleton
export function SettingsDialogSkeleton({ className }) {
    return (<div className={cn("space-y-6 p-6 animate-fade-in", className)}>
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <Skeleton className="h-6 w-32" variant="shimmer"/>
        <Skeleton className="h-6 w-6 rounded" variant="shimmer"/>
      </div>

      {/* Navigation tabs */}
      <div className="flex space-x-4 border-b border-border">
        {Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-8 w-20 mb-2" variant="shimmer"/>))}
      </div>

      {/* Settings content */}
      <div className="space-y-6">
        {Array.from({ length: 6 }).map((_, i) => (<div key={i} className="space-y-2" style={{ animationDelay: `${i * 0.1}s` }}>
            <Skeleton className="h-4 w-32" variant="shimmer"/>
            <Skeleton className="h-10 w-full rounded" variant="wave"/>
            {i % 3 === 0 && (<Skeleton className="h-3 w-48" variant="shimmer"/>)}
          </div>))}
      </div>

      {/* Footer actions */}
      <div className="flex justify-between pt-4 border-t border-border">
        <Skeleton className="h-10 w-16 rounded" variant="shimmer"/>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-16 rounded" variant="shimmer"/>
          <Skeleton className="h-10 w-12 rounded" variant="shimmer"/>
        </div>
      </div>
    </div>);
}
// Event editor skeleton
export function EventEditorSkeleton({ className }) {
    return (<div className={cn("space-y-6 p-6 animate-fade-in", className)}>
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <Skeleton className="h-6 w-28" variant="shimmer"/>
        <Skeleton className="h-6 w-6 rounded" variant="shimmer"/>
      </div>

      {/* Event form fields */}
      <div className="space-y-4">
        {/* Title */}
        <div className="space-y-2 animate-slide-in" style={{ animationDelay: '0.1s' }}>
          <Skeleton className="h-4 w-12" variant="shimmer"/>
          <Skeleton className="h-10 w-full rounded" variant="wave"/>
        </div>

        {/* Description */}
        <div className="space-y-2 animate-slide-in" style={{ animationDelay: '0.2s' }}>
          <Skeleton className="h-4 w-20" variant="shimmer"/>
          <Skeleton className="h-20 w-full rounded" variant="wave"/>
        </div>

        {/* Calendar selection */}
        <div className="space-y-2 animate-slide-in" style={{ animationDelay: '0.3s' }}>
          <Skeleton className="h-4 w-16" variant="shimmer"/>
          <Skeleton className="h-10 w-full rounded" variant="wave"/>
        </div>

        {/* Date and time fields */}
        <div className="grid grid-cols-2 gap-4 animate-slide-in" style={{ animationDelay: '0.4s' }}>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" variant="shimmer"/>
            <Skeleton className="h-10 w-full rounded" variant="wave"/>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" variant="shimmer"/>
            <Skeleton className="h-10 w-full rounded" variant="wave"/>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 animate-slide-in" style={{ animationDelay: '0.5s' }}>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" variant="shimmer"/>
            <Skeleton className="h-10 w-full rounded" variant="wave"/>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" variant="shimmer"/>
            <Skeleton className="h-10 w-full rounded" variant="wave"/>
          </div>
        </div>

        {/* All day toggle */}
        <div className="flex items-center space-x-2 animate-slide-in" style={{ animationDelay: '0.6s' }}>
          <Skeleton className="h-4 w-4 rounded" variant="shimmer"/>
          <Skeleton className="h-4 w-24" variant="shimmer"/>
        </div>

        {/* Location */}
        <div className="space-y-2 animate-slide-in" style={{ animationDelay: '0.7s' }}>
          <Skeleton className="h-4 w-16" variant="shimmer"/>
          <Skeleton className="h-10 w-full rounded" variant="wave"/>
        </div>

        {/* Color selection */}
        <div className="space-y-2 animate-slide-in" style={{ animationDelay: '0.8s' }}>
          <Skeleton className="h-4 w-12" variant="shimmer"/>
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-8 w-8 rounded-full" variant="shimmer"/>))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t border-border animate-scale-in" style={{ animationDelay: '0.9s' }}>
        <Skeleton className="h-10 w-16 rounded" variant="shimmer"/>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-16 rounded" variant="shimmer"/>
          <Skeleton className="h-10 w-12 rounded" variant="shimmer"/>
        </div>
      </div>
    </div>);
}
// Mobile calendar skeleton
export function MobileCalendarSkeleton({ className }) {
    return (<div className={cn("h-screen flex flex-col bg-background animate-fade-in", className)}>
      {/* Mobile header */}
      <div className="flex items-center justify-between p-4 border-b border-border safe-area-inset-top">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" variant="shimmer"/>
          <div className="space-y-1">
            <Skeleton className="h-5 w-24" variant="shimmer"/>
            <Skeleton className="h-3 w-16" variant="shimmer"/>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded" variant="shimmer"/>
          <Skeleton className="h-8 w-8 rounded" variant="shimmer"/>
        </div>
      </div>

      {/* Calendar navigation */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded" variant="shimmer"/>
            <Skeleton className="h-6 w-32" variant="shimmer"/>
            <Skeleton className="h-6 w-6 rounded" variant="shimmer"/>
          </div>
          <div className="flex gap-1">
            <Skeleton className="h-8 w-16 rounded" variant="shimmer"/>
            <Skeleton className="h-8 w-8 rounded" variant="shimmer"/>
          </div>
        </div>
      </div>

      {/* Calendar content */}
      <div className="flex-1 p-4">
        <Skeleton className="h-full w-full rounded-lg" variant="wave"/>
      </div>

      {/* Mobile bottom navigation */}
      <div className="border-t border-border bg-background/95 backdrop-blur safe-area-inset-bottom">
        <div className="flex justify-around py-2">
          {Array.from({ length: 4 }).map((_, i) => (<div key={i} className="flex flex-col items-center gap-1 p-2">
              <Skeleton className="h-6 w-6 rounded" variant="shimmer"/>
              <Skeleton className="h-3 w-12" variant="shimmer"/>
            </div>))}
        </div>
      </div>
    </div>);
}
// List skeleton for generic lists
export function ListSkeleton({ itemCount = 5, className }) {
    return (<div className={cn("space-y-3 animate-fade-in", className)}>
      {Array.from({ length: itemCount }).map((_, i) => (<div key={i} className="flex items-center gap-4 p-4 rounded-lg border border-border animate-slide-in" style={{ animationDelay: `${i * 0.1}s` }}>
          <Skeleton className="h-10 w-10 rounded-full" variant="shimmer"/>
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" variant="wave"/>
            <Skeleton className="h-3 w-1/2" variant="wave"/>
          </div>
          <Skeleton className="h-6 w-16 rounded" variant="shimmer"/>
        </div>))}
    </div>);
}
// Form skeleton for generic forms
export function FormSkeleton({ fieldCount = 6, className }) {
    return (<div className={cn("space-y-4 animate-fade-in", className)}>
      {Array.from({ length: fieldCount }).map((_, i) => (<div key={i} className="space-y-2 animate-slide-in" style={{ animationDelay: `${i * 0.1}s` }}>
          <Skeleton className="h-4 w-20" variant="shimmer"/>
          <Skeleton className={`w-full rounded ${i % 3 === 2 ? 'h-20' : 'h-10'}`} variant="wave"/>
          {i % 4 === 0 && (<Skeleton className="h-3 w-48 text-xs" variant="shimmer"/>)}
        </div>))}
      
      {/* Form actions */}
      <div className="flex justify-end gap-2 pt-4 border-t border-border animate-scale-in">
        <Skeleton className="h-10 w-16 rounded" variant="shimmer"/>
        <Skeleton className="h-10 w-12 rounded" variant="shimmer"/>
      </div>
    </div>);
}
