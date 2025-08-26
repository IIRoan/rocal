import { Navbar, HeroSection, PricingSection, Footer, } from "@workspace/ui/components/landing";
export const metadata = {
    title: "Rocani - The Smartest Way to Manage Your Time | AI-Powered Calendar",
    description: "Transform your productivity with Rocani's intelligent calendar platform. AI-powered scheduling, seamless team collaboration, and smart time analytics. Join 10,000+ teams worldwide. Start free today.",
};
export default function Page() {
    return (<div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <HeroSection />
    <PricingSection />
      </main>
      <Footer />
    </div>);
}
