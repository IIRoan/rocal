"use client";

import * as React from "react";
import { ArrowRight, Plug, CheckCircle } from "lucide-react";

import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";

const integrations = [
  {
    name: "Google Calendar",
    description: "Seamless sync with your existing Google Calendar events",
    category: "Calendar",
    logo: "🗓️",
    color: "bg-[#4285F4]/10 text-[#4285F4]",
    popular: true,
  },
  {
    name: "Microsoft Outlook",
    description: "Full integration with Outlook calendar and email",
    category: "Calendar",
    logo: "📧",
    color: "bg-[#0078D4]/10 text-[#0078D4]",
    popular: true,
  },
  {
    name: "Slack",
    description: "Get meeting notifications and schedule directly from Slack",
    category: "Communication",
    logo: "💬",
    color: "bg-[#4A154B]/10 text-[#4A154B]",
    popular: true,
  },
  {
    name: "Zoom",
    description: "Auto-generate meeting links for all your scheduled events",
    category: "Video",
    logo: "📹",
    color: "bg-[#2D8CFF]/10 text-[#2D8CFF]",
    popular: true,
  },
  {
    name: "Microsoft Teams",
    description: "Native Teams meeting integration and scheduling",
    category: "Video",
    logo: "🎥",
    color: "bg-[#6264A7]/10 text-[#6264A7]",
    popular: false,
  },
  {
    name: "Notion",
    description: "Sync your calendar with Notion databases and pages",
    category: "Productivity",
    logo: "📝",
    color: "bg-black/10 text-black dark:bg-white/10 dark:text-white",
    popular: false,
  },
  {
    name: "Salesforce",
    description: "Automatically create calendar events from CRM activities",
    category: "CRM",
    logo: "☁️",
    color: "bg-[#00A1E0]/10 text-[#00A1E0]",
    popular: false,
  },
  {
    name: "Jira",
    description: "Track time and schedule sprints directly in your calendar",
    category: "Project Management",
    logo: "🎯",
    color: "bg-[#0052CC]/10 text-[#0052CC]",
    popular: false,
  },
  {
    name: "GitHub",
    description: "Schedule code reviews and track project deadlines",
    category: "Development",
    logo: "🐙",
    color: "bg-black/10 text-black dark:bg-white/10 dark:text-white",
    popular: false,
  },
];

const categories = [
  "All",
  "Calendar",
  "Communication",
  "Video",
  "Productivity",
  "CRM",
  "Project Management",
  "Development",
];

export function IntegrationsSection() {
  const [selectedCategory, setSelectedCategory] = React.useState("All");

  const filteredIntegrations =
    selectedCategory === "All"
      ? integrations
      : integrations.filter(
          (integration) => integration.category === selectedCategory,
        );

  return (
    <section className="py-24 px-6 bg-muted/20">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="rounded-full px-4 py-2 mb-4">
            Integrations
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
            Connects with everything
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              you already use
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Rocani seamlessly integrates with your existing tools and workflows.
            No need to change how you work – we adapt to you.
          </p>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {categories.map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(category)}
              className="rounded-full"
            >
              {category}
            </Button>
          ))}
        </div>

        {/* Integrations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredIntegrations.map((integration) => (
            <Card
              key={integration.name}
              className={`group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-card/50 backdrop-blur-sm border-border/50 relative ${
                integration.popular ? "ring-1 ring-primary/20" : ""
              }`}
            >
              {integration.popular && (
                <Badge className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs">
                  Popular
                </Badge>
              )}

              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div
                    className={`p-3 rounded-lg ${integration.color} text-2xl group-hover:scale-110 transition-transform duration-300`}
                  >
                    {integration.logo}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">
                        {integration.name}
                      </h3>
                      <CheckCircle className="h-4 w-4 text-success" />
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {integration.category}
                    </Badge>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {integration.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* More Integrations CTA */}
        <div className="mt-16 text-center space-y-6">
          <div className="p-8 rounded-2xl bg-gradient-to-r from-primary/10 to-accent/10 border border-border/50">
            <Plug className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-foreground mb-2">
              Don't see your tool?
            </h3>
            <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
              We're constantly adding new integrations. Request your favorite
              tools or use our powerful API to build custom connections.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button className="rounded-full px-6 group">
                Request Integration
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button variant="outline" className="rounded-full px-6">
                View API Docs
              </Button>
            </div>
          </div>

          {/* Integration Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">50+</div>
              <div className="text-sm text-muted-foreground">
                Native Integrations
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-accent mb-2">99.9%</div>
              <div className="text-sm text-muted-foreground">
                Sync Reliability
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-success mb-2">
                &lt;1min
              </div>
              <div className="text-sm text-muted-foreground">Setup Time</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
