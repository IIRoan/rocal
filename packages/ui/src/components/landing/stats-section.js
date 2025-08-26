"use client";
import * as React from "react";
import { TrendingUp, Calendar, Clock, Users, Zap, Award } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
const stats = [
    {
        icon: Calendar,
        value: "2.5M+",
        label: "Events Scheduled",
        description: "Meetings and events organized through Rocani",
        color: "text-primary",
        bgColor: "bg-primary/10"
    },
    {
        icon: Clock,
        value: "15,000",
        label: "Hours Saved",
        description: "Time saved monthly through smart scheduling",
        color: "text-accent",
        bgColor: "bg-accent/10"
    },
    {
        icon: Users,
        value: "50k+",
        label: "Active Users",
        description: "Professionals using Rocani daily",
        color: "text-[var(--chart-2)]",
        bgColor: "bg-[var(--chart-2)]/10"
    },
    {
        icon: Zap,
        value: "98%",
        label: "Faster Scheduling",
        description: "Average time reduction in meeting coordination",
        color: "text-success",
        bgColor: "bg-success/10"
    },
    {
        icon: TrendingUp,
        value: "300%",
        label: "Productivity Boost",
        description: "Average productivity increase reported by users",
        color: "text-[var(--chart-3)]",
        bgColor: "bg-[var(--chart-3)]/10"
    },
    {
        icon: Award,
        value: "4.9★",
        label: "User Rating",
        description: "Based on 10,000+ reviews across app stores",
        color: "text-warning",
        bgColor: "bg-warning/10"
    }
];
export function StatsSection() {
    return (<section className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="rounded-full px-4 py-2 mb-4">
            Impact
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
            Proven results that
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              speak for themselves
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Join thousands of teams who have transformed their productivity with
            Rocani's intelligent scheduling platform.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stats.map((stat, index) => (<Card key={stat.label} className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-lg ${stat.bgColor} group-hover:scale-110 transition-transform duration-300`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`}/>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className={`text-3xl font-bold ${stat.color}`}>
                      {stat.value}
                    </div>
                    <div className="font-semibold text-foreground">
                      {stat.label}
                    </div>
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      {stat.description}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>))}
        </div>

        {/* Bottom Achievement Bar */}
        <div className="mt-16 p-8 rounded-2xl bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border border-border/50">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Award className="h-6 w-6 text-primary"/>
              <Badge className="bg-primary text-primary-foreground">
                Industry Leader
              </Badge>
            </div>
            <h3 className="text-2xl font-bold text-foreground">
              Recognized as the #1 Smart Calendar Platform
            </h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Winner of multiple productivity awards and consistently rated as the
              top calendar solution by G2, ProductHunt, and TechRadar.
            </p>
          </div>
        </div>
      </div>
    </section>);
}
