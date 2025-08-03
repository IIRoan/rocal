import type { Metadata } from "next";
import {
  Navbar,
  HeroSection,
  FeaturesSection,
  PricingSection,
  Footer,
} from "@workspace/ui/components/landing";

export const metadata: Metadata = {
  title: "Rocani - Smart Calendar for Modern Teams",
  description:
    "Experience the future of scheduling with intelligent automation, seamless collaboration, and calendar insights that adapt to your workflow.",
};

export default function Page() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <HeroSection />
        <FeaturesSection />
        <PricingSection />
      </main>
      <Footer />
    </div>
  );
}
