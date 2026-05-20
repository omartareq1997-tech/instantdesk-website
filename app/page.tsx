import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import TrustedBy from "./components/TrustedBy";
import OmnichannelSection from "./components/OmnichannelSection";
import Features from "./components/Features";
import DemoShowcase from "./components/DemoShowcase";
import DashboardPreview from "./components/DashboardPreview";
import HowItWorks from "./components/HowItWorks";
import Pricing from "./components/Pricing";
import Testimonials from "./components/Testimonials";
import CTA from "./components/CTA";
import Footer from "./components/Footer";

export default function Home() {
  return (
    <main className="flex-1">
      <Navbar />
      <Hero />
      <TrustedBy />
      <OmnichannelSection />
      <Features />
      <DemoShowcase />
      <DashboardPreview />
      <HowItWorks />
      <Pricing />
      <Testimonials />
      <CTA />
      <Footer />
    </main>
  );
}
