"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { useSession } from "@/lib/auth-client";
import { Logo } from "@workspace/ui/components/layout";
import {
  FORCE_LOADING_DESIGN_PREVIEW,
  PageLoadingOverlay,
} from "@workspace/ui/components/ui";
import { Button } from "@workspace/ui/components/ui/button";
import { ArrowRight, Calendar, Sparkles, ShieldCheck } from "lucide-react";

export function HomePageClient() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && session?.user) {
      router.replace("/dashboard");
    }
  }, [isPending, session?.user, router]);

  if (FORCE_LOADING_DESIGN_PREVIEW || isPending) {
    return <PageLoadingOverlay isLoading={true} messageContext="AUTH_FLOW" />;
  }

  if (session?.user) {
    return null;
  }

  const handleLoginClick = () => {
    if (Capacitor.isNativePlatform()) {
      router.push("/mobile-login");
    } else {
      router.push("/login");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background relative overflow-hidden flex flex-col">
      {/* Decorative background elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-[100px] opacity-70" />
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 relative z-10 safe-area-inset-top safe-area-inset-bottom">
        <div className="w-full max-w-4xl mx-auto text-center space-y-8 animate-fade-in-zoom py-12">
          
          <div className="flex justify-center mb-8">
            <div className="p-4 rounded-3xl bg-card border shadow-sm ring-1 ring-border/50">
              <Logo width={64} height={64} className="text-primary" aria-label="Solace Logo" />
            </div>
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground">
              Master your time with <span className="text-primary">Solace</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              A beautifully crafted calendar and time management platform designed for focus, clarity, and peace of mind.
            </p>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button 
              size="lg" 
              className="w-full sm:w-auto h-14 px-8 text-base font-medium rounded-full shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all group"
              onClick={handleLoginClick}
            >
              Get Started <ArrowRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>

          {/* Features showcase for desktop & larger mobile */}
          <div className="pt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto text-left">
            <div className="flex flex-col gap-3 p-6 rounded-3xl bg-card border shadow-sm transition-all hover:shadow-md hover:border-primary/20">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground text-lg">Smart Calendar</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Seamlessly plan your days with an intuitive interface built for speed and precision.</p>
            </div>
            <div className="flex flex-col gap-3 p-6 rounded-3xl bg-card border shadow-sm transition-all hover:shadow-md hover:border-primary/20">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground text-lg">Beautiful Design</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Enjoy a clutter-free, minimalist workspace that respects your time and attention.</p>
            </div>
            <div className="flex flex-col gap-3 p-6 rounded-3xl bg-card border shadow-sm transition-all hover:shadow-md hover:border-primary/20">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <ShieldCheck className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground text-lg">Secure & Private</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Your data belongs to you. Built with modern security standards and end-to-end privacy.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
