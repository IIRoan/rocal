"use client";

import * as React from "react";
import { ChevronDown, HelpCircle, ArrowRight } from "lucide-react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { Card, CardContent } from "../ui/card";

const faqs = [
  {
    question: "How does Rocani's AI scheduling work?",
    answer: "Our AI analyzes your calendar patterns, preferences, and availability to automatically suggest the best meeting times. It considers factors like time zones, working hours, travel time between meetings, and even your productivity patterns to optimize your schedule.",
    category: "Features"
  },
  {
    question: "Can I use Rocani with my existing calendar?",
    answer: "Absolutely! Rocani seamlessly integrates with Google Calendar, Microsoft Outlook, Apple Calendar, and other popular calendar platforms. Your existing events sync automatically, and changes made in either platform are reflected everywhere.",
    category: "Integration"
  },
  {
    question: "Is there a free version available?",
    answer: "Yes! Our Personal plan is free forever for individuals. It includes up to 3 calendars, basic scheduling features, mobile app access, and 1GB storage. Perfect for personal use and trying out Rocani's core features.",
    category: "Pricing"
  },
  {
    question: "How secure is my data with Rocani?",
    answer: "Security is our top priority. We use enterprise-grade encryption, comply with GDPR and SOC 2 standards, and never sell your data. All calendar information is encrypted both in transit and at rest. You maintain full ownership of your data.",
    category: "Security"
  },
  {
    question: "Can teams of different sizes use Rocani?",
    answer: "Yes! Rocani scales from individual users to enterprise teams of thousands. Our Personal plan is great for individuals, Professional for small teams and freelancers, and Team plan includes advanced admin controls and enterprise features.",
    category: "Plans"
  },
  {
    question: "What happens if I want to cancel my subscription?",
    answer: "You can cancel anytime with no penalties. We provide full data export in standard formats, and your account remains active until the end of your billing period. No questions asked, though we'd love feedback on how we can improve!",
    category: "Billing"
  },
  {
    question: "Does Rocani work offline?",
    answer: "Our mobile apps offer offline capabilities, allowing you to view your calendar and create events without an internet connection. Changes sync automatically once you're back online. The web app requires internet connectivity.",
    category: "Features"
  },
  {
    question: "How does time zone handling work?",
    answer: "Rocani automatically detects and handles time zones intelligently. When scheduling with people in different time zones, it shows local times for each participant and suggests meeting times that work best for everyone involved.",
    category: "Features"
  },
  {
    question: "Can I customize notifications and reminders?",
    answer: "Yes! You have full control over notifications. Set custom reminder times, choose notification methods (email, push, SMS), and create smart reminders that adapt based on meeting location, travel time, and importance level.",
    category: "Customization"
  },
  {
    question: "Is there an API available for custom integrations?",
    answer: "Yes, we offer a comprehensive REST API and webhooks for custom integrations. Our API documentation includes examples and SDKs for popular programming languages. Perfect for connecting with internal tools or building custom workflows.",
    category: "Integration"
  }
];

const categories = ["All", ...Array.from(new Set(faqs.map(faq => faq.category)))];

export function FAQSection() {
  const [selectedCategory, setSelectedCategory] = React.useState("All");
  const [openItems, setOpenItems] = React.useState<string[]>([]);

  const filteredFAQs = selectedCategory === "All" 
    ? faqs 
    : faqs.filter(faq => faq.category === selectedCategory);

  const toggleItem = (index: string) => {
    setOpenItems(prev => 
      prev.includes(index)
        ? prev.filter(item => item !== index)
        : [...prev, index]
    );
  };

  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="rounded-full px-4 py-2 mb-4">
            FAQ
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
            Frequently asked
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              questions
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Everything you need to know about Rocani. Can't find what you're
            looking for? Chat with our friendly team.
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

        {/* FAQ List */}
        <div className="space-y-4">
          {filteredFAQs.map((faq, index) => {
            const itemId = `${selectedCategory}-${index}`;
            const isOpen = openItems.includes(itemId);
            
            return (
              <Card key={itemId} className="bg-card/50 backdrop-blur-sm border-border/50">
                <Collapsible>
                  <CollapsibleTrigger
                    onClick={() => toggleItem(itemId)}
                    className="w-full"
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 text-left">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <HelpCircle className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground">
                              {faq.question}
                            </h3>
                            <Badge variant="outline" className="text-xs mt-1">
                              {faq.category}
                            </Badge>
                          </div>
                        </div>
                        <ChevronDown
                          className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                    </CardContent>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="px-6 pb-6">
                      <div className="pl-12">
                        <p className="text-muted-foreground leading-relaxed">
                          {faq.answer}
                        </p>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>

        {/* Contact Support CTA */}
        <div className="mt-16 text-center">
          <Card className="p-8 bg-gradient-to-r from-primary/10 to-accent/10 border-border/50">
            <CardContent className="p-0">
              <h3 className="text-2xl font-bold text-foreground mb-2">
                Still have questions?
              </h3>
              <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                Our support team is here to help. Get in touch and we'll get back
                to you as soon as possible.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button className="rounded-full px-6 group">
                  Contact Support
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button variant="outline" className="rounded-full px-6">
                  Schedule a Demo
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
