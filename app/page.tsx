import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import LiveActivityStrip from "./components/LiveActivityStrip";
import TrustedBy from "./components/TrustedBy";
import BrandSlider from "./components/BrandSlider";
import OmnichannelSection from "./components/OmnichannelSection";
import Features from "./components/Features";
import DemoShowcase from "./components/DemoShowcase";
import DashboardPreview from "./components/DashboardPreview";
import HowItWorks from "./components/HowItWorks";
import WebsiteIntegration from "./components/WebsiteIntegration";
import Pricing from "./components/Pricing";
import Testimonials from "./components/Testimonials";
import CTA from "./components/CTA";
import Footer from "./components/Footer";

export default function Home() {
  return (
    <main className="flex-1">
      <Navbar />
      <Hero />
      <LiveActivityStrip />
      <TrustedBy />
      <BrandSlider />
      <OmnichannelSection />
      <Features />
      <DemoShowcase />
      <DashboardPreview />
      <HowItWorks />
      <WebsiteIntegration />
      <Pricing />
      <Testimonials />
      <CTA />
      <Footer />
    </main>
  );
}
