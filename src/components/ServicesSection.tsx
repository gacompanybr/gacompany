import { BarChart3, Megaphone, PenTool, Globe, LineChart, Zap } from "lucide-react";

const services = [
  { icon: Megaphone, title: "Tráfego Pago", desc: "Campanhas otimizadas no Google, Meta e TikTok Ads para atrair clientes qualificados." },
  { icon: PenTool, title: "Criação de Conteúdo", desc: "Estratégias de conteúdo que engajam, educam e convertem sua audiência." },
  { icon: Globe, title: "Social Media", desc: "Gestão completa das redes sociais com foco em crescimento orgânico e pago." },
  { icon: BarChart3, title: "Gestão de CRM", desc: "Automação e gestão do funil de vendas para maximizar cada oportunidade." },
  { icon: LineChart, title: "SEO & Analytics", desc: "Posicionamento orgânico e dashboards com métricas que importam." },
  { icon: Zap, title: "Automação", desc: "Fluxos automatizados de nutrição, remarketing e follow-up." },
];

const ServicesSection = () => {
  return (
    <section id="servicos" className="py-20 lg:py-32 bg-background">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">O que fazemos</span>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3 mb-4">
            Soluções completas de <span className="text-gradient-gold">marketing digital</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Cada serviço é pensado para trabalhar em sinergia, criando uma máquina de crescimento previsível.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="group bg-card border border-border rounded-2xl p-8 hover:border-primary/40 transition-all duration-300 hover:shadow-[var(--shadow-gold)]">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors">
                <Icon className="text-primary" size={24} />
              </div>
              <h3 className="font-heading text-xl font-bold mb-3 text-foreground">{title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
