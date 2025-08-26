"use client";
import * as React from "react";
import Link from "next/link";
import { Calendar, Moon, Sun, Menu } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetTrigger } from "../ui/sheet";
import { cn } from "../../lib/utils";
const navItems = [
    { name: "Features", href: "#features" },
    { name: "Pricing", href: "#pricing" },
    { name: "About", href: "#about" },
];
export function Navbar() {
    const { theme, setTheme } = useTheme();
    const [isScrolled, setIsScrolled] = React.useState(false);
    const [isOpen, setIsOpen] = React.useState(false);
    React.useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);
    const handleNavClick = (href) => {
        const element = document.querySelector(href);
        if (element) {
            element.scrollIntoView({ behavior: "smooth" });
        }
        setIsOpen(false);
    };
    return (<header className={cn("fixed top-0 left-0 right-0 z-50 transition-all duration-300", isScrolled
            ? "bg-background/80 backdrop-blur-md border-b border-border"
            : "bg-transparent")}>
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Calendar className="h-6 w-6 text-primary"/>
            </div>
            <span className="text-xl font-semibold text-foreground">
              Rocani
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (<Button key={item.name} variant="ghost" onClick={() => handleNavClick(item.href)} className="text-muted-foreground hover:text-foreground px-4 py-2 rounded-full font-medium transition-colors">
                {item.name}
              </Button>))}
          </nav>

          {/* Right Side Actions */}
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="rounded-full">
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"/>
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"/>
              <span className="sr-only">Toggle theme</span>
            </Button>

            {/* Login Button */}
            <Link href="/login" className="hidden md:block">
              <Button className="rounded-full px-6 font-medium shadow-sm">
                Login
              </Button>
            </Link>

            {/* Mobile Menu */}
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Menu className="h-5 w-5"/>
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80">
                <div className="flex flex-col gap-6 mt-8">
                  <nav className="flex flex-col gap-2">
                    {navItems.map((item) => (<Button key={item.name} variant="ghost" onClick={() => handleNavClick(item.href)} className="justify-start text-lg py-3 px-4 rounded-lg">
                        {item.name}
                      </Button>))}
                  </nav>
                  <div className="border-t border-border pt-6">
                    <Link href="/login" className="w-full block">
                      <Button className="w-full rounded-lg font-medium py-3">
                        Login
                      </Button>
                    </Link>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>);
}
