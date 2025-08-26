"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, Calendar, Clock, Users, Sparkles, Play, CheckCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
export function HeroSection() {
    const [isVideoPlaying, setIsVideoPlaying] = React.useState(false);
    return (<section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Enhanced Background with multiple layers */}
      <div className="absolute inset-0">
        {/* Animated grid pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,theme(colors.border)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.border)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,#000_70%,transparent_110%)] animate-pulse"/>
        </div>
        
        {/* Dynamic gradient orbs */}
        <div className="absolute inset-0 opacity-60">
          <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-primary/20 rounded-full blur-3xl animate-pulse"/>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse delay-1000"/>
          <div className="absolute top-2/3 left-3/4 w-48 h-48 bg-primary/15 rounded-full blur-2xl animate-pulse delay-500"/>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-32">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Column - Content */}
          <div className="text-center lg:text-left space-y-8">
            {/* Announcement Badge with enhanced styling */}
            <div className="flex justify-center lg:justify-start mb-8">
              <Badge className="rounded-full px-6 py-3 text-sm font-medium bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30 shadow-lg backdrop-blur-sm animate-pulse">
                ✨ New: AI-powered scheduling + 50% faster setup
              </Badge>
            </div>

            {/* Enhanced Main Heading */}
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-foreground leading-tight">
              The
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-pulse"> smartest </span>
              way to manage
              <br />
              <span className="relative">
                your time
                <div className="absolute -inset-2 bg-gradient-to-r from-primary/20 to-accent/20 blur-lg -z-10 animate-pulse"/>
              </span>
            </h1>

            {/* Enhanced Subtitle */}
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto lg:mx-0 leading-relaxed">
              Stop juggling calendars. Start experiencing seamless scheduling with 
              <span className="font-semibold text-foreground"> AI that learns </span>
              your preferences and 
              <span className="font-semibold text-foreground"> automatically optimizes </span>
              your day.
            </p>

            {/* Enhanced CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center">
              <Link href="/dashboard">
                <Button size="lg" className="rounded-full px-10 py-5 text-lg font-semibold shadow-2xl bg-gradient-to-r from-primary to-accent hover:shadow-primary/25 group transition-all duration-300 hover:scale-105">
                  Start Free - No Card Required
                  <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-2 transition-transform duration-300"/>
                </Button>
              </Link>
              <Button variant="outline" size="lg" className="rounded-full px-10 py-5 text-lg font-semibold border-2 hover:bg-accent/10 group transition-all duration-300" onClick={() => setIsVideoPlaying(true)}>
                <Play className="mr-2 h-5 w-5 group-hover:scale-110 transition-transform"/>
                Watch Demo (2 min)
              </Button>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap justify-center lg:justify-start items-center gap-6 text-sm text-muted-foreground pt-6">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success"/>
                <span>Free forever plan</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success"/>
                <span>5-minute setup</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success"/>
                <span>Works with existing calendars</span>
              </div>
            </div>
          </div>

          {/* Right Column - Product Preview */}
          <div className="relative">
            {/* Mock product interface */}
            <div className="relative mx-auto max-w-lg lg:max-w-none">
              <Card className="overflow-hidden bg-card/80 backdrop-blur-sm border border-border/50 shadow-2xl rotate-2 hover:rotate-0 transition-transform duration-500">
                <CardContent className="p-8">
                  <div className="space-y-6">
                    {/* Mock calendar header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Calendar className="h-6 w-6 text-primary"/>
                        <span className="font-semibold">Smart Schedule</span>
                      </div>
                      <Badge className="bg-success/10 text-success">AI Optimized</Badge>
                    </div>
                    
                    {/* Mock time slots */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                        <Clock className="h-4 w-4 text-primary"/>
                        <div>
                          <div className="text-sm font-medium">Team Sync</div>
                          <div className="text-xs text-muted-foreground">9:00 AM - 9:30 AM</div>
                        </div>
                        <Sparkles className="h-4 w-4 text-primary ml-auto"/>
                      </div>
                      
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/10 border border-accent/20">
                        <Users className="h-4 w-4 text-accent"/>
                        <div>
                          <div className="text-sm font-medium">Client Meeting</div>
                          <div className="text-xs text-muted-foreground">2:00 PM - 3:00 PM</div>
                        </div>
                        <Badge className="text-xs">Auto-scheduled</Badge>
                      </div>
                      
                      <div className="p-3 rounded-lg bg-muted/20 border border-dashed border-border">
                        <div className="text-sm text-muted-foreground text-center">
                          ✨ AI found 3 optimal focus blocks
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Floating elements */}
              <div className="absolute -top-4 -right-4 p-3 rounded-full bg-success/10 backdrop-blur-sm border border-success/20">
                <CheckCircle className="h-6 w-6 text-success"/>
              </div>
              <div className="absolute -bottom-4 -left-4 p-3 rounded-full bg-primary/10 backdrop-blur-sm border border-primary/20">
                <Sparkles className="h-6 w-6 text-primary animate-spin"/>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Feature Highlights */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Card className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-2 bg-card/50 backdrop-blur-sm border border-border/50 relative overflow-hidden">
            <CardContent className="p-8 text-center relative z-10">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 mb-6 mx-auto w-fit group-hover:scale-110 transition-transform duration-300">
                <Calendar className="h-8 w-8 text-primary"/>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors">Smart Scheduling</h3>
              <p className="text-muted-foreground leading-relaxed">
                AI analyzes patterns and preferences to automatically find optimal meeting times for everyone
              </p>
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"/>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-2 bg-card/50 backdrop-blur-sm border border-border/50 relative overflow-hidden">
            <CardContent className="p-8 text-center relative z-10">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/10 mb-6 mx-auto w-fit group-hover:scale-110 transition-transform duration-300">
                <Users className="h-8 w-8 text-accent"/>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3 group-hover:text-accent transition-colors">Team Collaboration</h3>
              <p className="text-muted-foreground leading-relaxed">
                Share calendars, coordinate schedules, and collaborate seamlessly with your entire team
              </p>
              <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"/>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-2 bg-card/50 backdrop-blur-sm border border-border/50 relative overflow-hidden">
            <CardContent className="p-8 text-center relative z-10">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[var(--chart-3)]/20 to-[var(--chart-3)]/10 mb-6 mx-auto w-fit group-hover:scale-110 transition-transform duration-300">
                <Clock className="h-8 w-8 text-[var(--chart-3)]"/>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3 group-hover:text-[var(--chart-3)] transition-colors">Time Analytics</h3>
              <p className="text-muted-foreground leading-relaxed">
                Discover time patterns and get actionable insights to optimize your productivity
              </p>
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--chart-3)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"/>
            </CardContent>
          </Card>
        </div>

        {/* Enhanced Social Proof */}
        <div className="mt-24 pt-16 border-t border-border/20">
          <div className="text-center space-y-8">
            <div className="space-y-2">
              <p className="text-lg font-medium text-foreground">
                Trusted by 10,000+ teams worldwide
              </p>
              <p className="text-sm text-muted-foreground">
                From startups to Fortune 500 companies
              </p>
            </div>
            
            {/* Company logos with better styling */}
            <div className="flex flex-wrap justify-center items-center gap-12 opacity-60">
              <div className="h-12 w-32 bg-gradient-to-r from-muted to-muted/50 rounded-lg flex items-center justify-center font-semibold text-muted-foreground">TechFlow</div>
              <div className="h-12 w-28 bg-gradient-to-r from-muted to-muted/50 rounded-lg flex items-center justify-center font-semibold text-muted-foreground">DataSync</div>
              <div className="h-12 w-36 bg-gradient-to-r from-muted to-muted/50 rounded-lg flex items-center justify-center font-semibold text-muted-foreground">ScaleUp Inc</div>
              <div className="h-12 w-30 bg-gradient-to-r from-muted to-muted/50 rounded-lg flex items-center justify-center font-semibold text-muted-foreground">InnovateLab</div>
              <div className="h-12 w-34 bg-gradient-to-r from-muted to-muted/50 rounded-lg flex items-center justify-center font-semibold text-muted-foreground">NextGen</div>
            </div>
            
            {/* Quick stats */}
            <div className="flex justify-center items-center gap-8 text-sm text-muted-foreground pt-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-success rounded-full animate-pulse"/>
                <span>2.5M+ events scheduled</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"/>
                <span>99.9% uptime</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>);
}
