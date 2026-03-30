"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";
import { setupIonicReact } from "@ionic/react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { getApiBaseUrl } from "@/lib/api-url";
import { Browser } from "@capacitor/browser";

setupIonicReact({
  mode: "ios",
});

const isNativePlatform = Capacitor.isNativePlatform();

type MobileRuntimeBridgeProps = {
  children: React.ReactNode;
};

const getSafeAppPath = (value: string | null | undefined) => {
  if (!value || !value.startsWith("/")) {
    return "/dashboard";
  }

  return value;
};

const normalizeCustomSchemeCallback = (incomingUrl: string) => {
  const parsedUrl = new URL(incomingUrl);

  if (parsedUrl.protocol !== "app.solace.onl:") {
    return null;
  }

  const host = parsedUrl.hostname;
  const path = parsedUrl.pathname || "";
  const normalizedPath = host ? `/${host}${path}` : path;

  if (!normalizedPath.startsWith("/api/auth")) {
    return null;
  }

  const search = parsedUrl.search || "";
  return `${normalizedPath}${search}`;
};

export function MobileRuntimeBridge({ children }: MobileRuntimeBridgeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const hasTriggeredInitialRouteRef = useRef(false);
  const completedAuthHandoffTokensRef = useRef<Set<string>>(new Set());
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [isProcessingAuth, setIsProcessingAuth] = useState(false);
  const [authStatus, setAuthStatus] = useState<string>("");

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const finishAuthenticatedNavigation = async (callbackURL?: string | null, handoffToken?: string | null) => {
    const safeCallbackUrl = getSafeAppPath(callbackURL);
    
    console.log("[mobile-auth] finishAuthenticatedNavigation called", {
      callbackURL,
      hasHandoffToken: !!handoffToken,
      safeCallbackUrl,
    });
    
    try {
      // Add timeout to prevent hanging
      const sessionResult = await Promise.race([
        authClient.getSession(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Session check timeout")), 5000)
        ),
      ]);

      const hasUser = !!sessionResult?.data?.user;

      console.log("[mobile-auth] Session readback result", {
        hasUser,
        safeCallbackUrl,
        userId: sessionResult?.data?.user?.id,
      });

      if (!hasUser) {
        // If we have a handoff token but no session, the OTT verification should handle it
        // Don't redirect to login immediately - the deep link handler will verify the token
        if (handoffToken) {
          console.log("[mobile-auth] No session but have handoff token, waiting for OTT verification");
          return;
        }
        
        const loginParams = new URLSearchParams({
          error: "mobile_session_missing",
        });
        if (safeCallbackUrl !== "/dashboard") {
          loginParams.set("next", safeCallbackUrl);
        }
        router.replace(`/mobile-login?${loginParams.toString()}`);
        setAuthErrorMessage("Authentication session was not persisted");
        return;
      }

      setAuthErrorMessage(null);
      
      // Use window.location for more reliable navigation in mobile context
      console.log("[mobile-auth] Navigating to", safeCallbackUrl);
      if (window.location.pathname !== safeCallbackUrl) {
        window.location.replace(safeCallbackUrl);
      } else {
        router.replace(safeCallbackUrl);
        setTimeout(() => {
          router.refresh();
        }, 100);
      }
    } catch (error) {
      console.error("[mobile-auth] Failed to confirm session:", error);
      
      // If we have a handoff token, don't redirect to login - OTT verification might succeed
      if (handoffToken) {
        console.log("[mobile-auth] Session check failed but have handoff token, waiting");
        return;
      }
      
      const loginParams = new URLSearchParams({
        error: "mobile_session_missing",
      });
      if (safeCallbackUrl !== "/dashboard") {
        loginParams.set("next", safeCallbackUrl);
      }
      router.replace(`/mobile-login?${loginParams.toString()}`);
      setAuthErrorMessage("Authentication session was not persisted");
    }
  };

  useEffect(() => {
    if (!isNativePlatform) {
      return;
    }

    document.body.classList.add("capacitor-app");

    let backButtonHandle: { remove: () => Promise<void> } | null = null;
    let appUrlOpenHandle: { remove: () => Promise<void> } | null = null;

    const initializeNativeRuntime = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setOverlaysWebView({ overlay: true });
      } catch {
        // StatusBar plugin may be unavailable in desktop/browser contexts.
      }

      try {
        await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
      } catch {
        // Keyboard plugin is only available in native mobile contexts.
      }

      backButtonHandle = await CapacitorApp.addListener(
        "backButton",
        ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
            return;
          }

          if (Capacitor.getPlatform() === "android") {
            void CapacitorApp.exitApp();
          }
        },
      );

      appUrlOpenHandle = await CapacitorApp.addListener("appUrlOpen", ({ url }) => {
        console.log("[mobile-auth] appUrlOpen", { url });
        void Browser.close().catch(() => undefined);
        
        const deepLinkUrl = new URL(url);
        const handoffToken = deepLinkUrl.searchParams.get("ott");
        const nextPath = getSafeAppPath(deepLinkUrl.searchParams.get("next"));
        const redirectError = deepLinkUrl.searchParams.get("error");

        if (handoffToken || redirectError) {
          if (redirectError) {
            const loginParams = new URLSearchParams({ error: redirectError });
            if (nextPath !== "/dashboard") {
              loginParams.set("next", nextPath);
            }
            router.replace(`/mobile-login?${loginParams.toString()}`);
            setAuthErrorMessage("Authentication failed");
            return;
          }

          // Immediately mark token as being handled to prevent duplicate verification
          if (handoffToken) {
            if (completedAuthHandoffTokensRef.current.has(handoffToken)) {
              console.log("[mobile-auth] Token already handled, skipping duplicate verification");
              window.location.replace(nextPath);
              return;
            }
            completedAuthHandoffTokensRef.current.add(handoffToken);
          }

          if (!handoffToken) {
            window.location.replace(nextPath);
            return;
          }

          setIsProcessingAuth(true);
          setAuthStatus("Securing your session...");

          void fetch(`${getApiBaseUrl()}/api/auth/one-time-token/verify`, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ token: handoffToken }),
          })
            .then(async (response) => {
              console.log("[mobile-auth] OTT verify response", {
                status: response.status,
                ok: response.ok,
                nextPath,
              });
              if (!response.ok) {
                throw new Error(`Failed to verify token (${response.status})`);
              }

              completedAuthHandoffTokensRef.current.add(handoffToken);
              setAuthStatus("Login successful! Opening app...");
              await finishAuthenticatedNavigation(nextPath, handoffToken);
            })
            .catch((error: unknown) => {
              console.error("Mobile one-time-token handoff failed:", error);
              setIsProcessingAuth(false);
              const loginParams = new URLSearchParams({
                error: "mobile_handoff_verify_failed",
              });
              if (nextPath !== "/dashboard") {
                loginParams.set("next", nextPath);
              }
              router.replace(`/mobile-login?${loginParams.toString()}`);
              setAuthErrorMessage("Authentication failed");
            });
          return;
        }

        const normalizedHref = normalizeCustomSchemeCallback(url);
        if (!normalizedHref) {
          console.log("[mobile-auth] Ignoring non-auth deep link", { url });
          return;
        }

        console.log("[mobile-auth] Handling custom scheme callback", {
          normalizedHref,
        });

        void authClient
          .$fetch(normalizedHref.replace("/api/auth", ""))
          .then(({ error }: { error?: { message?: string } | null }) => {
            if (error) {
              console.error("Custom mobile auth callback failed:", error);
              const loginParams = new URLSearchParams({
                error: "oauth_error",
              });
              router.replace(`/mobile-login?${loginParams.toString()}`);
              setAuthErrorMessage(error.message || "Authentication failed");
              return;
            }

            const parsedUrl = new URL(url);
            const callbackURL = parsedUrl.searchParams.get("callbackURL");
            console.log("[mobile-auth] Custom scheme callback fetch succeeded", {
              callbackURL,
            });
            void finishAuthenticatedNavigation(callbackURL);
          })
          .catch((error: unknown) => {
            console.error("Custom mobile auth callback threw:", error);
            const loginParams = new URLSearchParams({
              error: "oauth_error",
            });
            router.replace(`/mobile-login?${loginParams.toString()}`);
            setAuthErrorMessage("Authentication failed");
          });
      });

      try {
        const launchUrl = await CapacitorApp.getLaunchUrl();
        if (launchUrl?.url) {
          console.log("[mobile-auth] Launch URL detected", {
            url: launchUrl.url,
          });
          const normalizedHref = normalizeCustomSchemeCallback(launchUrl.url);
          if (normalizedHref) {
            void authClient
              .$fetch(normalizedHref.replace("/api/auth", ""))
              .then(({ error }: { error?: { message?: string } | null }) => {
                if (error) {
                  console.error("Initial custom mobile auth callback failed:", error);
                  return;
                }

                const parsedUrl = new URL(launchUrl.url);
                const callbackURL = parsedUrl.searchParams.get("callbackURL");
                void finishAuthenticatedNavigation(callbackURL);
              })
              .catch((error: unknown) => {
                console.error("Initial custom mobile auth callback threw:", error);
              });
          }
        }
      } catch {
        // getLaunchUrl may be unavailable depending on platform/runtime state.
      }
    };

    void initializeNativeRuntime();

    return () => {
      document.body.classList.remove("capacitor-app");
      if (backButtonHandle) {
        void backButtonHandle.remove();
      }
      if (appUrlOpenHandle) {
        void appUrlOpenHandle.remove();
      }
    };
  }, [router]);

  useEffect(() => {
    if (!isNativePlatform) {
      return;
    }

    if (!hasTriggeredInitialRouteRef.current) {
      hasTriggeredInitialRouteRef.current = true;
      return;
    }

    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  }, [pathname]);

  if (!isClient) {
    return <>{children}</>;
  }

  if (!isNativePlatform) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      {isProcessingAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            <p className="text-sm font-medium text-foreground">{authStatus}</p>
          </div>
        </div>
      )}
    </>
  );
}
