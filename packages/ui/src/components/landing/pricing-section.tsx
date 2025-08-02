"use client";

import * as React from "react";
import { Check, Star, ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Badge } from "../ui/badge";

const plans = [
  {
    name: "Personal",
    price: "Free",
    period: "forever",
    description: "Perfect for individuals managing their personal schedule",
    popular: false,
    features: [
      "Up to 3 calendars",
      "Basic scheduling",
      "Mobile app access",
      "Email notifications",
      "1GB storage"
    ],
    cta: "Get Started",
    href: "/dashboard"
  },
  {
    name: "Professional",
    price: "$12",
    period: "per month",
    description: "Advanced features for professionals and freelancers",
    popular: true,
    features: [
      "Unlimited calendars",
      "AI-powered scheduling",
      "Team collaboration",
      "Advanced analytics",
      "Priority support",
      "10GB storage",
      "Custom integrations"
    ],
    cta: "Start Free Trial",
    href: "/dashboard"
  },
  {
    name: "Team",
    price: "$24",
    period: "per user/month",
    description: "Complete solution for teams and organizations",
    popular: false,
    features: [
      "Everything in Professional",
      "Unlimited team members",
      "Advanced admin controls",
      "Single sign-on (SSO)",
      "Custom branding",
      "100GB storage",
      "24/7 phone support",
      "SLA guarantee"
    ],
    cta: "Contact Sales",
    href: "/contact"
  }
];

export function PricingSection() {
  return (
    <section id="pricing" className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="rounded-full px-4 py-2 mb-4">
            Pricing
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
            Simple, transparent
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              pricing for everyone
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Start free and scale as you grow. No hidden fees, no surprises. 
            Cancel anytime with full data export.
          </p>
        </div>

        {/* Pricing Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <Card 
              key={plan.name}
              className={`relative group hover:shadow-xl transition-all duration-300 ${
                plan.popular 
                  ? 'ring-2 ring-primary scale-105 shadow-lg' 
                  : 'hover:-translate-y-1'
              } bg-card/50 backdrop-blur-sm border-border/50`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="rounded-full px-4 py-1 bg-primary text-primary-foreground shadow-lg">
                    <Star className="h-3 w-3 mr-1" />
                    Most Popular
                  </Badge>
                </div>
              )}
              
              <CardHeader className="pb-6">
                <div className="space-y-4">
                  <h3 className="text-2xl font-bold text-foreground">{plan.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                    {plan.price !== "Free" && (
                      <span className="text-muted-foreground">/{plan.period}</span>
                    )}
                  </div>
                  <p className="text-muted-foreground">{plan.description}</p>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                <ul className="space-y-3">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link href={plan.href} className="block">
                  <Button 
                    className={`w-full rounded-lg font-medium py-3 group ${
                      plan.popular 
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                        : ''
                    }`}
                    variant={plan.popular ? "default" : "outline"}
                  >
                    {plan.cta}
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bottom Note */}
        <div className="mt-16 text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            All plans include a 14-day free trial. No credit card required.
          </p>
          <div className="flex flex-wrap justify-center items-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3 text-success" />
              Cancel anytime
            </span>
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3 text-success" />
              Full data export
            </span>
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3 text-success" />
              24/7 support
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}