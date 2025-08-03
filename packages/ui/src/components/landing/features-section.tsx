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
        {/* Section Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="rounded-full px-4 py-2 mb-4">
            Features
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
            Everything you need to
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              master your time
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Rocani brings together powerful scheduling tools, intelligent
            automation, and seamless collaboration in one beautiful calendar
            experience.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <Card
              key={feature.title}
              className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 bg-card/50 backdrop-blur-sm border-border/50"
            >
              <CardContent className="p-6">
                <div className="flex flex-col items-start gap-4">
                  <div
                    className={`p-3 rounded-lg ${feature.bgColor} group-hover:scale-110 transition-transform duration-300`}
                  >
                    <feature.icon className={`h-6 w-6 ${feature.color}`} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-success" />
            <span>Free forever for personal use</span>
          </div>
        </div>
      </div>
    </section>
  );
}
