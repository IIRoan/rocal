"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Calendar, Clock, Users } from "lucide-react";

import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,theme(colors.border)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.border)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
      </div>

      {/* Gradient Orbs */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse delay-1000" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-32 text-center">
        {/* Announcement Badge */}
        <div className="flex justify-center mb-8">
          <Badge
            variant="secondary"
            className="rounded-full px-4 py-2 text-sm font-medium"
          >
            ✨ Now with AI-powered scheduling
          </Badge>
        </div>

        {/* Main Heading */}
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground mb-6 leading-tight">
          Smart Calendar for
          <br />
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Modern Teams
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed">
          Experience the future of scheduling with intelligent automation,
          seamless collaboration, and calendar insights that adapt to your
          workflow.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
          <Link href="/dashboard">
            <Button
              size="lg"
              className="rounded-full px-8 py-4 text-lg font-medium shadow-lg group"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <Button
            variant="outline"
            size="lg"
            className="rounded-full px-8 py-4 text-lg font-medium"
          >
            View Demo
          </Button>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50">
            <div className="p-3 rounded-full bg-primary/10">
              <Calendar className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground">Smart Scheduling</h3>
            <p className="text-sm text-muted-foreground text-center">
              AI finds the perfect time for everyone automatically
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50">
            <div className="p-3 rounded-full bg-accent/10">
              <Users className="h-6 w-6 text-accent" />
            </div>
            <h3 className="font-semibold text-foreground">
              Team Collaboration
            </h3>
            <p className="text-sm text-muted-foreground text-center">
              Share calendars and coordinate with your team effortlessly
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50">
            <div className="p-3 rounded-full bg-chart-3/10">
              <Clock className="h-6 w-6 text-[var(--chart-3)]" />
            </div>
            <h3 className="font-semibold text-foreground">Time Analytics</h3>
            <p className="text-sm text-muted-foreground text-center">
              Get insights into how you spend your time and optimize it
            </p>
          </div>
        </div>

        {/* Social Proof */}
        <div className="mt-16 pt-16 border-t border-border/50">
          <p className="text-sm text-muted-foreground mb-8">
            Trusted by teams at leading companies
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 opacity-60">
            {/* Placeholder for company logos */}
            <div className="h-8 w-24 bg-muted rounded" />
            <div className="h-8 w-20 bg-muted rounded" />
            <div className="h-8 w-28 bg-muted rounded" />
            <div className="h-8 w-22 bg-muted rounded" />
            <div className="h-8 w-26 bg-muted rounded" />
          </div>
        </div>
      </div>
    </section>
  );
}
