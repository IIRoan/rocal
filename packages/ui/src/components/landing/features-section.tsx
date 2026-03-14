"use client";

import * as React from "react";
import {
  Calendar,
  Users,
  Zap,
  Shield,
  Globe,
  BarChart3,
  Smartphone,
  Clock,
  CheckCircle,
} from "lucide-react";

import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";

const features = [
  {
    icon: Calendar,
    title: "Intelligent Scheduling",
    description:
      "AI-powered scheduling that learns your preferences and finds the perfect time for everyone.",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description:
      "Share calendars, create team events, and coordinate with colleagues seamlessly.",
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
  {
    icon: Zap,
    title: "Quick Actions",
    description:
      "Create events, reschedule meetings, and manage your time with lightning-fast shortcuts.",
    color: "text-[var(--chart-2)]",
    bgColor: "bg-[var(--chart-2)]/10",
  },
  {
    icon: Shield,
    title: "Privacy & Security",
    description:
      "Enterprise-grade security with end-to-end encryption and granular privacy controls.",
    color: "text-success",
    bgColor: "bg-success/10",
  },
  {
    icon: Globe,
    title: "Global Time Zones",
    description:
      "Automatic timezone detection and conversion for seamless international collaboration.",
    color: "text-[var(--chart-3)]",
    bgColor: "bg-[var(--chart-3)]/10",
  },
  {
    icon: BarChart3,
    title: "Time Analytics",
    description:
      "Detailed insights into how you spend your time with actionable recommendations.",
    color: "text-[var(--chart-4)]",
    bgColor: "bg-[var(--chart-4)]/10",
  },
  {
    icon: Smartphone,
    title: "Mobile First",
    description:
      "Native mobile apps with full feature parity and offline synchronization.",
    color: "text-[var(--chart-5)]",
    bgColor: "bg-[var(--chart-5)]/10",
  },
  {
    icon: Clock,
    title: "Smart Reminders",
    description:
      "Contextual notifications that adapt to your schedule and location.",
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-6 bg-muted/20">
      <div className="max-w-7xl mx-auto">
        {/* Enhanced Section Header */}
        <div className="text-center mb-20">
          <Badge
            variant="secondary"
            className="rounded-full px-6 py-3 mb-6 text-sm font-medium shadow-lg"
          >
            ✨ Features
          </Badge>
          <h2 className="text-4xl md:text-6xl font-bold text-foreground mb-8 leading-tight">
            Everything you need to
            <br />
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-pulse">
              master your time
            </span>
          </h2>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
            Rocani brings together powerful scheduling tools, intelligent
            automation, and seamless collaboration in one beautiful calendar
            experience that adapts to your workflow.
          </p>
        </div>

        {/* Enhanced Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <Card
              key={feature.title}
              className="group hover:shadow-2xl transition-all duration-500 hover:-translate-y-3 bg-card/60 backdrop-blur-sm border border-border/50 relative overflow-hidden hover:border-primary/20"
              style={{
                animationDelay: `${index * 100}ms`,
                animation: "fadeInUp 0.6s ease-out forwards",
              }}
            >
              {/* Hover gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <CardContent className="p-8 relative z-10">
                <div className="flex flex-col items-start gap-6">
                  <div
                    className={`p-4 rounded-2xl ${feature.bgColor} group-hover:scale-125 group-hover:rotate-3 transition-all duration-500 shadow-lg group-hover:shadow-xl`}
                  >
                    <feature.icon className={`h-7 w-7 ${feature.color}`} />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors duration-300">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed group-hover:text-foreground/80 transition-colors duration-300">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </CardContent>

              {/* Animated border on hover */}
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/50 to-accent/50 opacity-0 group-hover:opacity-20 transition-opacity duration-500 blur-sm" />
            </Card>
          ))}
        </div>

        {/* Enhanced Bottom CTA */}
        <div className="mt-20 text-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-success/10 border border-success/20">
              <CheckCircle className="h-5 w-5 text-success animate-pulse" />
              <span className="font-medium text-success">
                Free forever for personal use
              </span>
            </div>

            <p className="text-muted-foreground max-w-2xl mx-auto">
              Start with our generous free plan, then scale as your team grows.
              No hidden fees, no surprises.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
