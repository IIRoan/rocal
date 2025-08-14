"use client"

import { useState, useEffect, useCallback } from "react"
import { signIn, authClient, useSession } from "@/lib/auth-client"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPasskeySupported, setIsPasskeySupported] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const { data: session, isPending } = useSession()
  const router = useRouter()

  // Monitor session changes and redirect when authenticated
  const handleSessionRedirect = useCallback(() => {
    if (session?.user) {
      router.replace("/dashboard")
    }
  }, [session, router])

  // Check if user is already logged in and redirect
  useEffect(() => {
    if (!isPending) {
      setIsCheckingSession(false)
      handleSessionRedirect()
    }
  }, [session, isPending, handleSessionRedirect])

  // Check if passkeys are supported (but don't auto-trigger)
  useEffect(() => {
    if (typeof window !== "undefined" && window.PublicKeyCredential) {
      setIsPasskeySupported(true)
    }
  }, [])

  const handlePasskeyLogin = async () => {
    try {
      setPasskeyLoading(true)
      setError(null)

      const result = await authClient.signIn.passkey({
        autoFocus: true,
      })

      // Check if authentication was successful
      if (result?.data?.user || result?.user) {
        // Wait a moment for session to be established, then redirect
        setTimeout(() => {
          router.replace("/dashboard")
        }, 100)
      } else {
        // If no user data, try to refresh session
        setTimeout(() => {
          router.refresh()
        }, 500)
      }
    } catch (error: any) {
      console.error("Passkey login failed:", error)
      setError(error.message || "Passkey authentication failed. Please try again.")
      setPasskeyLoading(false)
    }
  }

  const handleGitHubLogin = async () => {
    try {
      setIsLoading(true)
      await signIn.social({
        provider: "github",
        callbackURL: "/dashboard",
      })
    } catch (error) {
      console.error("Login failed:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Show loading state while checking session
  if (isPending || isCheckingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="relative">
            <div className="w-12 h-12 border-2 border-primary/20 rounded-full animate-spin mx-auto"></div>
            <div className="absolute inset-0 w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
          <p className="text-sm text-muted-foreground">Checking authentication status...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted/20">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Main card */}
        <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl p-8 shadow-lg shadow-black/5 animate-scale-in">
          {/* Header */}
          <div className="text-center space-y-3 mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
              <svg className="w-8 h-8 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-semibold text-foreground tracking-tight">Welcome back</h1>
            <p className="text-muted-foreground">Sign in to your account to continue</p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 animate-slide-in">
              <div className="flex items-center space-x-2">
                <svg
                  className="w-5 h-5 text-destructive flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            </div>
          )}

          {/* Auth Methods */}
          <div className="space-y-4">
            {isPasskeySupported ? (
              <>
                {/* Primary passkey button */}
                <button
                  onClick={handlePasskeyLogin}
                  disabled={passkeyLoading}
                  className="group relative w-full h-12 px-6 bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-xl font-medium shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
                  <div className="relative flex items-center justify-center space-x-2">
                    {passkeyLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin"></div>
                        <span>Authenticating...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v-2H7v-2H4a1 1 0 01-1-1v-4a1 1 0 011-1h3l4.586-4.586A6 6 0 0121 9z"
                          />
                        </svg>
                        <span>Continue with Passkey</span>
                      </>
                    )}
                  </div>
                </button>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border/60"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-card px-4 text-muted-foreground font-medium">or continue with</span>
                  </div>
                </div>

                {/* GitHub button */}
                <button
                  onClick={handleGitHubLogin}
                  disabled={isLoading}
                  className="group relative w-full h-12 px-6 bg-card border border-border/60 text-foreground rounded-xl font-medium hover:bg-accent hover:border-border transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                >
                  <div className="flex items-center justify-center space-x-2">
                    {isLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin"></div>
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                        </svg>
                        <span>Continue with GitHub</span>
                      </>
                    )}
                  </div>
                </button>
              </>
            ) : (
              <div className="text-center py-12 space-y-4 animate-fade-in">
                <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-foreground">Passkeys not supported</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Please use a modern browser that supports WebAuthn to enable passkey authentication.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-border/50 text-center">
            <p className="text-xs text-muted-foreground">Secure authentication powered by modern web standards</p>
          </div>
        </div>
      </div>
    </div>
  )
}
