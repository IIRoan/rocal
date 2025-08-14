"use client";

import * as React from "react";
import { Star, Quote } from "lucide-react";

import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "Product Manager",
    company: "TechFlow",
    avatar: "SC",
    rating: 5,
    content: "Rocani has transformed how our team manages meetings. The AI scheduling feature alone saves us hours every week. It's like having a personal assistant for everyone.",
    featured: true
  },
  {
    name: "Marcus Rodriguez",
    role: "Startup Founder", 
    company: "InnovateLab",
    avatar: "MR",
    rating: 5,
    content: "The time analytics feature helped me realize I was spending 40% of my time in unnecessary meetings. Now I'm more productive than ever.",
    featured: false
  },
  {
    name: "Emily Watson",
    role: "Engineering Lead",
    company: "DataSync",
    avatar: "EW", 
    rating: 5,
    content: "Finally, a calendar that understands timezone complexity. Our distributed team coordination has never been smoother.",
    featured: false
  },
  {
    name: "David Kim",
    role: "Operations Director",
    company: "ScaleUp Inc",
    avatar: "DK",
    rating: 5, 
    content: "The team collaboration features are outstanding. Shared calendars and event coordination happen seamlessly now.",
    featured: true
  },
  {
    name: "Lisa Thompson",
    role: "Marketing Director", 
    company: "BrandForward",
    avatar: "LT",
    rating: 5,
    content: "Smart reminders have eliminated the chaos of missed meetings. The contextual notifications are incredibly helpful.",
    featured: false
  },
  {
    name: "James Park",
    role: "CEO",
    company: "NextGen Solutions",
    avatar: "JP",
    rating: 5,
    content: "Rocani scaled with our company from 10 to 200 employees. The enterprise features and security are top-notch.",
    featured: true
  }
];

export function TestimonialsSection() {
  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${i < rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground"}`}
      />
    ));
  };

  return (
    <section className="py-24 px-6 bg-muted/20">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="rounded-full px-4 py-2 mb-4">
            Testimonials
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
            Loved by teams
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              around the world
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Join thousands of teams who have transformed their scheduling and time
            management with Rocani.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <Card
              key={testimonial.name}
              className={`group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-card/50 backdrop-blur-sm border-border/50 ${
                testimonial.featured
                  ? "md:scale-105 ring-1 ring-primary/20"
                  : ""
              }`}
            >
              <CardContent className="p-6">
                <div className="space-y-4">
                  {/* Quote Icon */}
                  <Quote className="h-8 w-8 text-primary/40" />
                  
                  {/* Rating */}
                  <div className="flex gap-1">
                    {renderStars(testimonial.rating)}
                  </div>
                  
                  {/* Content */}
                  <p className="text-muted-foreground leading-relaxed">
                    "{testimonial.content}"
                  </p>
                  
                  {/* Author */}
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={`/avatars/${testimonial.avatar.toLowerCase()}.jpg`} />
                      <AvatarFallback className="bg-primary/10 text-primary font-medium">
                        {testimonial.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-foreground text-sm">
                        {testimonial.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {testimonial.role} • {testimonial.company}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bottom Stats */}
        <div className="mt-16 pt-12 border-t border-border/50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-foreground mb-2">10k+</div>
              <div className="text-sm text-muted-foreground">Active Teams</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-foreground mb-2">4.9/5</div>
              <div className="text-sm text-muted-foreground">Average Rating</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-foreground mb-2">99.9%</div>
              <div className="text-sm text-muted-foreground">Uptime</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
