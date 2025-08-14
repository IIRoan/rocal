"use client"

import { useState, useEffect, useCallback } from "react"
import { signIn, authClient, useSession } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { Lock, Github, Key, Shield, Check } from "lucide-react"

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
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background matching landing page style */}
        <div className="absolute inset-0">
          {/* Animated grid pattern */}
          <div className="absolute inset-0 opacity-30">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,theme(colors.border)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.border)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,#000_70%,transparent_110%)] animate-pulse" />
          </div>
          
          {/* Dynamic gradient orbs */}
          <div className="absolute inset-0 opacity-60">
            <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-primary/20 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse delay-1000" />
            <div className="absolute top-2/3 left-3/4 w-48 h-48 bg-primary/15 rounded-full blur-2xl animate-pulse delay-500" />
          </div>
        </div>
        
        <div className="relative z-10 text-center space-y-8 animate-fade-in">
          <div className="relative">
            <div className="w-16 h-16 border-2 border-primary/30 rounded-full animate-spin mx-auto"></div>
            <div className="absolute inset-0 w-16 h-16 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Checking authentication status...</h2>
            <p className="text-muted-foreground">Please wait while we verify your session</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background matching landing page */}
      <div className="absolute inset-0">
        {/* Animated grid pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,theme(colors.border)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.border)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,#000_70%,transparent_110%)] animate-pulse" />
        </div>
        
        {/* Dynamic gradient orbs */}
        <div className="absolute inset-0 opacity-60">
          <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-primary/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-2/3 left-3/4 w-48 h-48 bg-primary/15 rounded-full blur-2xl animate-pulse delay-500" />
        </div>
      </div>

      <div className="relative z-10 max-w-md mx-auto px-6">
        {/* Main login card matching landing page card style */}
        <div className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-2 bg-card/80 backdrop-blur-sm border border-border/50 relative overflow-hidden rounded-2xl animate-scale-in">
          <div className="p-8 relative z-10">
            {/* Header matching landing page style */}
            <div className="text-center space-y-6 mb-8">
              {/* Icon with landing page styling */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 mb-6 mx-auto w-fit group-hover:scale-110 transition-transform duration-300">
                <Lock className="h-8 w-8 text-primary" />
              </div>
              
              <div className="space-y-2">
                <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                  Welcome back
                </h1>
                <p className="text-xl text-muted-foreground leading-relaxed">
                  Sign in to your account to continue
                </p>
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 animate-slide-in">
                <div className="flex items-center space-x-3">
                  <div className="w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-destructive text-sm font-bold">!</span>
                  </div>
                  <p className="text-sm text-destructive font-medium">{error}</p>
                </div>
              </div>
            )}

            {/* Auth Methods */}
            <div className="space-y-6">
              {isPasskeySupported ? (
                <>
                  {/* Primary passkey button matching landing page style */}
                  <button
                    onClick={handlePasskeyLogin}
                    disabled={passkeyLoading}
                    className="w-full rounded-full px-8 py-4 text-lg font-semibold shadow-2xl bg-gradient-to-r from-primary to-accent hover:shadow-primary/25 group transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    <div className="flex items-center justify-center space-x-3">
                      {passkeyLoading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                          <span>Authenticating...</span>
                        </>
                      ) : (
                        <>
                          <Key className="h-5 w-5 group-hover:scale-110 transition-transform" />
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
                    <div className="relative flex justify-center">
                      <span className="bg-card px-4 text-sm text-muted-foreground font-medium">or continue with</span>
                    </div>
                  </div>

                  {/* GitHub button matching landing page style */}
                  <button
                    onClick={handleGitHubLogin}
                    disabled={isLoading}
                    className="w-full rounded-full px-8 py-4 text-lg font-semibold border-2 hover:bg-accent/10 group transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed border-border hover:border-border/80"
                  >
                    <div className="flex items-center justify-center space-x-3">
                      {isLoading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
                          <span>Signing in...</span>
                        </>
                      ) : (
                        <>
                          <Github className="h-5 w-5 group-hover:scale-110 transition-transform" />
                          <span>Continue with GitHub</span>
                        </>
                      )}
                    </div>
                  </button>
                </>
              ) : (
                <div className="text-center py-8 space-y-6 animate-fade-in">
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-muted/20 to-muted/10 mx-auto w-fit">
                    <Lock className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-xl font-bold text-foreground">Passkeys not supported</h3>
                    <p className="text-muted-foreground leading-relaxed max-w-sm mx-auto">
                      Please use a modern browser that supports WebAuthn to enable passkey authentication.
                    </p>
                  </div>
                  
                  {/* Fallback GitHub login */}
                  <button
                    onClick={handleGitHubLogin}
                    disabled={isLoading}
                    className="w-full rounded-full px-8 py-4 text-lg font-semibold border-2 hover:bg-accent/10 group transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed border-border hover:border-border/80"
                  >
                    <div className="flex items-center justify-center space-x-3">
                      {isLoading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
                          <span>Signing in...</span>
                        </>
                      ) : (
                        <>
                          <Github className="h-5 w-5 group-hover:scale-110 transition-transform" />
                          <span>Continue with GitHub</span>
                        </>
                      )}
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Footer matching landing page trust indicators */}
            <div className="mt-8 pt-6 border-t border-border/20 text-center">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground font-medium">
                  Secure authentication powered by modern web standards
                </p>
                
                {/* Trust indicators matching landing page */}
                <div className="flex flex-wrap justify-center items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-success" />
                    <span>256-bit SSL encryption</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-success" />
                    <span>WebAuthn standard</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="h-3 w-3 text-success" />
                    <span>Zero-knowledge architecture</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Background hover effect matching landing page cards */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>
      </div>
    </section>
  )
}
