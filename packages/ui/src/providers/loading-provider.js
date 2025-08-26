"use client";
import React, { createContext, useContext, useCallback, useState } from "react";
import { GlobalLoadingScreen } from "../components/ui/global-loading-screen";
const LoadingContext = createContext(undefined);
export function LoadingProvider({ children, defaultVariant = "detailed", }) {
    const [loadingStates, setLoadingStates] = useState([]);
    // Add or update a loading state
    const showLoading = useCallback((id, options = {}) => {
        setLoadingStates((prev) => {
            const existingIndex = prev.findIndex((state) => state.id === id);
            const newState = {
                id,
                message: options.message || "Loading...",
                variant: options.variant || defaultVariant,
                priority: options.priority || 0,
            };
            if (existingIndex >= 0) {
                // Update existing state
                const updated = [...prev];
                updated[existingIndex] = newState;
                return updated;
            }
            else {
                // Add new state
                return [...prev, newState];
            }
        });
    }, [defaultVariant]);
    // Remove a loading state
    const hideLoading = useCallback((id) => {
        setLoadingStates((prev) => prev.filter((state) => state.id !== id));
    }, []);
    // Clear all loading states
    const clearAllLoading = useCallback(() => {
        setLoadingStates([]);
    }, []);
    // Convenience methods for common loading scenarios
    const showPageLoading = useCallback((message = "Loading page...") => {
        showLoading("page", { message, variant: "detailed", priority: 10 });
    }, [showLoading]);
    const hidePageLoading = useCallback(() => {
        hideLoading("page");
    }, [hideLoading]);
    const showSplashLoading = useCallback((message = "Initializing application...") => {
        showLoading("splash", { message, variant: "splash", priority: 20 });
    }, [showLoading]);
    const hideSplashLoading = useCallback(() => {
        hideLoading("splash");
    }, [hideLoading]);
    // Calculate current loading state
    const isLoading = loadingStates.length > 0;
    // Get the highest priority loading state to display
    const currentLoadingState = loadingStates.reduce((highest, current) => {
        if (!highest || (current.priority || 0) > (highest.priority || 0)) {
            return current;
        }
        return highest;
    }, null);
    const contextValue = {
        isLoading,
        loadingStates,
        showLoading,
        hideLoading,
        clearAllLoading,
        showPageLoading,
        hidePageLoading,
        showSplashLoading,
        hideSplashLoading,
    };
    return (<LoadingContext.Provider value={contextValue}>
      {children}
      {/* Render the global loading screen when needed */}
      {currentLoadingState && (<GlobalLoadingScreen isLoading={true} message={currentLoadingState.message} variant={currentLoadingState.variant}/>)}
    </LoadingContext.Provider>);
}
// Hook to use loading context
export function useLoading() {
    const context = useContext(LoadingContext);
    if (!context) {
        throw new Error("useLoading must be used within a LoadingProvider");
    }
    return context;
}
// Hook for async operations with loading state
export function useLoadingOperation() {
    const { showLoading, hideLoading } = useLoading();
    const executeWithLoading = useCallback(async (operation, options) => {
        try {
            showLoading(options.id, {
                message: options.message,
                variant: options.variant,
                priority: options.priority,
            });
            const result = await operation();
            return result;
        }
        finally {
            hideLoading(options.id);
        }
    }, [showLoading, hideLoading]);
    return { executeWithLoading };
}
// Custom hook for component-level loading states
export function useComponentLoading(componentId) {
    const { showLoading, hideLoading, loadingStates } = useLoading();
    const isComponentLoading = loadingStates.some((state) => state.id === componentId);
    const setComponentLoading = useCallback((loading, options) => {
        if (loading) {
            showLoading(componentId, options);
        }
        else {
            hideLoading(componentId);
        }
    }, [componentId, showLoading, hideLoading]);
    return {
        isLoading: isComponentLoading,
        setLoading: setComponentLoading,
    };
}
