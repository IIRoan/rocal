"use client"

import { useState, useEffect, useCallback } from "react"
import { signIn, authClient, useSession } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { Lock, Github, Key, Shield, Check } from "lucide-react"
import { Logo } from "@workspace/ui/components/layout"

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

      if (result?.data?.user || result?.user) {
        setTimeout(() => {
          router.replace("/dashboard")
        }, 100)
      } else {
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

  // Loading state while checking session
  if (isPending || isCheckingSession) {
    return (
      <section className="min-h-screen flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo width={56} height={56} className="text-primary" aria-label="Rocal" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" aria-hidden="true" />
            <span>Checking your session…</span>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-card border border-border rounded-xl shadow-sm p-6">
          <div className="flex flex-col items-center text-center gap-3 mb-4">
            <Logo width={56} height={56} className="text-primary" aria-label="Rocal" />
            <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
            <p className="text-sm text-muted-foreground">Welcome back</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20" role="alert">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            {isPasskeySupported ? (
              <>
                {/* GitHub first */}
                <button
                  onClick={handleGitHubLogin}
                  disabled={isLoading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900 border border-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-busy={isLoading}
                >
                  {isLoading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                      <span>Signing in…</span>
                    </>
                  ) : (
                    <>
                      <Github className="h-4 w-4" />
                      <span>Continue with GitHub</span>
                    </>
                  )}
                </button>

                <div className="flex items-center gap-2 my-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {/* Passkey second */}
                <button
                  onClick={handlePasskeyLogin}
                  disabled={passkeyLoading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-busy={passkeyLoading}
                >
                  {passkeyLoading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" aria-hidden="true" />
                      <span>Authenticating…</span>
                    </>
                  ) : (
                    <>
                      <Key className="h-4 w-4" />
                      <span>Continue with Passkey</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <div className="text-center space-y-3">
                <div className="mx-auto w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">This browser does not support passkeys.</p>
                <button
                  onClick={handleGitHubLogin}
                  disabled={isLoading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900 border border-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-busy={isLoading}
                >
                  {isLoading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                      <span>Signing in…</span>
                    </>
                  ) : (
                    <>
                      <Github className="h-4 w-4" />
                      <span>Continue with GitHub</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="mt-6 text-center">
            <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1"><Check className="h-3 w-3 text-success" /><span>WebAuthn</span></div>
              <div className="flex items-center gap-1"><Shield className="h-3 w-3 text-success" /><span>Private & secure</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
