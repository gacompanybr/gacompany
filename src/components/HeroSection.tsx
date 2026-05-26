import { ArrowRight, TrendingUp, Users, Target, Phone, MessageCircle } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover" width={1920} height={1080} />
      <div className="absolute inset-0 bg-background/70" />

      <div className="relative z-10 container mx-auto px-4 lg:px-8 text-center pt-20">
        <div className="inline-flex items-center gap-2 bg-secondary/50 border border-border rounded-full px-4 py-2 mb-8 animate-fade-up">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm text-muted-foreground">Assessoria de Marketing Digital</span>
        </div>

        <h1 className="font-heading text-4xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6 animate-fade-up max-w-5xl mx-auto">
          Transformamos seu marketing em{" "}
          <span className="text-gradient-gold">resultados reais</span>
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-up">
          Estratégias personalizadas que geram leads qualificados, aumentam suas vendas e posicionam sua marca como referência no mercado.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-fade-up">
          <a href="#formulario" className="bg-gradient-gold text-primary-foreground px-8 py-4 rounded-lg font-semibold text-lg flex items-center gap-2 hover:opacity-90 transition-all animate-pulse-glow">
            Quero Crescer Agora <ArrowRight size={20} />
          </a>
          <a href="https://wa.me/5512988334006" target="_blank" rel="noopener noreferrer" className="border border-border text-foreground px-8 py-4 rounded-lg font-semibold hover:border-green-400 hover:text-green-400 transition-colors flex items-center gap-2">
            <MessageCircle size={20} /> Falar no WhatsApp
          </a>
          <a href="tel:+5512988334006" className="border border-border text-foreground px-8 py-4 rounded-lg font-semibold hover:border-primary hover:text-primary transition-colors flex items-center gap-2">
            <Phone size={20} /> Ligar Agora
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
          {[
            { icon: TrendingUp, value: "+500%", label: "Aumento médio em vendas" },
            { icon: Users, value: "200+", label: "Clientes atendidos" },
            { icon: Target, value: "98%", label: "Taxa de satisfação" },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex items-center gap-3 justify-center bg-card/50 backdrop-blur-sm border border-border rounded-xl p-4">
              <Icon className="text-primary" size={24} />
              <div className="text-left">
                <div className="text-xl font-bold text-primary font-heading">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
