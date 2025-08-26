"use client";
import * as React from "react";
import Link from "next/link";
import { Calendar, Github, Twitter, Linkedin, Mail } from "lucide-react";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
const footerLinks = {
    product: [
        { name: "Features", href: "#features" },
        { name: "Pricing", href: "#pricing" },
        { name: "Download", href: "/download" },
        { name: "Integrations", href: "/integrations" },
    ],
    company: [
        { name: "About", href: "/about" },
        { name: "Blog", href: "/blog" },
        { name: "Careers", href: "/careers" },
        { name: "Press", href: "/press" },
    ],
    support: [
        { name: "Help Center", href: "/help" },
        { name: "Contact", href: "/contact" },
        { name: "Status", href: "/status" },
        { name: "Community", href: "/community" },
    ],
    legal: [
        { name: "Privacy", href: "/privacy" },
        { name: "Terms", href: "/terms" },
        { name: "Security", href: "/security" },
        { name: "Cookies", href: "/cookies" },
    ],
};
export function Footer() {
    const handleNavClick = (href) => {
        if (href.startsWith("#")) {
            const element = document.querySelector(href);
            if (element) {
                element.scrollIntoView({ behavior: "smooth" });
            }
        }
    };
    return (<footer className="bg-card/50 backdrop-blur-sm border-t border-border/50">
      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-8 mb-12">
          {/* Brand Section */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Calendar className="h-6 w-6 text-primary"/>
              </div>
              <span className="text-xl font-semibold text-foreground">
                Rocani
              </span>
            </Link>
            <p className="text-muted-foreground mb-6 max-w-sm">
              The smart calendar for modern teams. Schedule smarter, collaborate
              better, and make the most of your time.
            </p>

            {/* Social Links */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="rounded-full">
                <Twitter className="h-4 w-4"/>
                <span className="sr-only">Twitter</span>
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Github className="h-4 w-4"/>
                <span className="sr-only">GitHub</span>
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Linkedin className="h-4 w-4"/>
                <span className="sr-only">LinkedIn</span>
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Mail className="h-4 w-4"/>
                <span className="sr-only">Email</span>
              </Button>
            </div>
          </div>

          {/* Links Sections */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Product</h3>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (<li key={link.name}>
                  {link.href.startsWith("#") ? (<button onClick={() => handleNavClick(link.href)} className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                      {link.name}
                    </button>) : (<Link href={link.href} className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                      {link.name}
                    </Link>)}
                </li>))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">Company</h3>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (<li key={link.name}>
                  <Link href={link.href} className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                    {link.name}
                  </Link>
                </li>))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">Support</h3>
            <ul className="space-y-3">
              {footerLinks.support.map((link) => (<li key={link.name}>
                  <Link href={link.href} className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                    {link.name}
                  </Link>
                </li>))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">Legal</h3>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (<li key={link.name}>
                  <Link href={link.href} className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                    {link.name}
                  </Link>
                </li>))}
            </ul>
          </div>
        </div>

        <Separator className="mb-8"/>

        {/* Bottom Section */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © 2024 Rocani. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Made with ❤️ for productive teams</span>
          </div>
        </div>
      </div>
    </footer>);
}
