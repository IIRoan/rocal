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
            "1GB storage",
        ],
        cta: "Get Started",
        href: "/dashboard",
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
            "Custom integrations",
        ],
        cta: "Start Free Trial",
        href: "/dashboard",
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
            "SLA guarantee",
        ],
        cta: "Contact Sales",
        href: "/contact",
    },
];
export function PricingSection() {
    return (<section id="pricing" className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Enhanced Section Header */}
        <div className="text-center mb-20">
          <Badge variant="secondary" className="rounded-full px-6 py-3 mb-6 text-sm font-medium shadow-lg">
            💰 Pricing
          </Badge>
          <h2 className="text-4xl md:text-6xl font-bold text-foreground mb-8 leading-tight">
            Simple, transparent
            <br />
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-pulse">
              pricing for everyone
            </span>
          </h2>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
            Start free and scale as you grow. No hidden fees, no surprises.
            Cancel anytime with full data export and migration support.
          </p>
        </div>

        {/* Enhanced Pricing Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (<Card key={plan.name} className={`relative group transition-all duration-500 ${plan.popular
                ? "ring-2 ring-primary/50 scale-105 shadow-2xl hover:shadow-primary/25 hover:scale-110 bg-gradient-to-br from-primary/5 to-accent/5"
                : "hover:-translate-y-3 hover:shadow-2xl bg-card/60"} backdrop-blur-sm border border-border/50 hover:border-primary/20 overflow-hidden`} style={{
                animationDelay: `${index * 200}ms`,
                animation: 'fadeInUp 0.6s ease-out forwards'
            }}>
              {/* Enhanced Popular Badge */}
              {plan.popular && (<div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-20">
                  <Badge className="rounded-full px-6 py-2 bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-2xl border border-primary/20 animate-pulse">
                    <Star className="h-4 w-4 mr-2 animate-spin"/>
                    Most Popular
                  </Badge>
                </div>)}
              
              {/* Animated background gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"/>

              <CardHeader className="pb-8 relative z-10">
                <div className="space-y-6">
                  <h3 className="text-3xl font-bold text-foreground group-hover:text-primary transition-colors duration-300">
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-5xl font-bold transition-colors duration-300 ${plan.popular ? "text-primary" : "text-foreground group-hover:text-primary"}`}>
                      {plan.price}
                    </span>
                    {plan.price !== "Free" && (<span className="text-lg text-muted-foreground">
                        /{plan.period}
                      </span>)}
                  </div>
                  <p className="text-muted-foreground text-lg leading-relaxed group-hover:text-foreground/80 transition-colors duration-300">
                    {plan.description}
                  </p>
                </div>
              </CardHeader>

              <CardContent className="space-y-8 relative z-10">
                <ul className="space-y-4">
                  {plan.features.map((feature, featureIndex) => (<li key={featureIndex} className="flex items-start gap-4 group/item" style={{
                    animationDelay: `${(index * 200) + (featureIndex * 100)}ms`,
                    animation: 'fadeInLeft 0.5s ease-out forwards'
                }}>
                      <Check className="h-5 w-5 text-primary shrink-0 mt-1 group-hover/item:scale-110 transition-transform duration-300"/>
                      <span className="text-muted-foreground group-hover/item:text-foreground transition-colors duration-300">
                        {feature}
                      </span>
                    </li>))}
                </ul>

                <Link href={plan.href} className="block">
                  <Button className={`w-full rounded-xl font-semibold py-4 text-lg group transition-all duration-300 hover:scale-105 ${plan.popular
                ? "bg-gradient-to-r from-primary to-accent text-primary-foreground hover:shadow-2xl hover:shadow-primary/25"
                : "hover:bg-primary/10 hover:border-primary/50"}`} variant={plan.popular ? "default" : "outline"}>
                    {plan.cta}
                    <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-2 transition-transform duration-300"/>
                  </Button>
                </Link>
              </CardContent>
            </Card>))}
        </div>

        {/* Enhanced Bottom Note */}
        <div className="mt-20 text-center space-y-8">
          <div className="p-8 rounded-2xl bg-gradient-to-r from-success/10 via-primary/5 to-accent/10 border border-success/20">
            <p className="text-lg font-medium text-foreground mb-4">
              All plans include a 14-day free trial. No credit card required.
            </p>
            <div className="flex flex-wrap justify-center items-center gap-8 text-sm text-muted-foreground">
              <span className="flex items-center gap-2 hover:text-foreground transition-colors">
                <Check className="h-4 w-4 text-success animate-pulse"/>
                Cancel anytime
              </span>
              <span className="flex items-center gap-2 hover:text-foreground transition-colors">
                <Check className="h-4 w-4 text-success animate-pulse"/>
                Full data export
              </span>
              <span className="flex items-center gap-2 hover:text-foreground transition-colors">
                <Check className="h-4 w-4 text-success animate-pulse"/>
                24/7 support
              </span>
              <span className="flex items-center gap-2 hover:text-foreground transition-colors">
                <Check className="h-4 w-4 text-success animate-pulse"/>
                Enterprise SSO
              </span>
            </div>
          </div>
          
          <p className="text-muted-foreground">
            Join thousands of teams already saving time with Rocani. 
            <span className="font-semibold text-primary">Start your free trial today!</span>
          </p>
        </div>
      </div>
    </section>);
}
