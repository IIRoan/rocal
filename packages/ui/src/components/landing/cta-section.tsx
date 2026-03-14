"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Calendar, Sparkles } from "lucide-react";

import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

export function CTASection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary to-accent p-1">
          {/* Animated border gradient */}
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-primary to-accent animate-pulse" />

          {/* Content container */}
          <div className="relative rounded-3xl bg-background p-12 md:p-16 text-center">
            {/* Decorative elements */}
            <div className="absolute top-6 left-6 text-primary/20">
              <Calendar className="h-8 w-8" />
            </div>
            <div className="absolute top-6 right-6 text-accent/20">
              <Sparkles className="h-8 w-8" />
            </div>
            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 text-primary/10">
              <Sparkles className="h-12 w-12" />
            </div>

            {/* Badge */}
            <div className="flex justify-center mb-6">
              <Badge className="bg-primary text-primary-foreground px-4 py-2 rounded-full">
                ✨ Limited Time: 50% off Professional plans
              </Badge>
            </div>

            {/* Heading */}
            <h2 className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
              Ready to take control of
              <br />
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                your time?
              </span>
            </h2>

            {/* Subheading */}
            <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
              Join thousands of teams who have transformed their productivity
              with Rocani's intelligent calendar platform.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              <Link href="/dashboard">
                <Button
                  size="lg"
                  className="rounded-full px-8 py-4 text-lg font-medium shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground group"
                >
                  Start Free Today
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="lg"
                className="rounded-full px-8 py-4 text-lg font-medium border-2"
              >
                Schedule a Demo
              </Button>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-success rounded-full" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-success rounded-full" />
                <span>14-day free trial</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-success rounded-full" />
                <span>Cancel anytime</span>
              </div>
            </div>

            {/* Social proof numbers */}
            <div className="mt-12 pt-8 border-t border-border/50">
              <div className="grid grid-cols-3 gap-8 max-w-lg mx-auto">
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground mb-1">
                    10k+
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Happy Teams
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground mb-1">
                    4.9★
                  </div>
                  <div className="text-xs text-muted-foreground">
                    User Rating
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground mb-1">
                    2.5M+
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Events Scheduled
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
