import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ServicesSection from "@/components/ServicesSection";
import MetodologiaSection from "@/components/MetodologiaSection";
import ResultsSection from "@/components/ResultsSection";
import EcossistemaSection from "@/components/EcossistemaSection";
import ClientesSection from "@/components/ClientesSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import SobreSection from "@/components/SobreSection";
import HowItWorksSection from "@/components/HowItWorksSection";
import ContactFormSection from "@/components/ContactFormSection";
import FooterSection from "@/components/FooterSection";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <ServicesSection />
      <MetodologiaSection />
      <ResultsSection />
      <EcossistemaSection />
      <ClientesSection />
      <TestimonialsSection />
      <SobreSection />
      <HowItWorksSection />
      <ContactFormSection />
      <FooterSection />
    </div>
  );
};

export default Index;
