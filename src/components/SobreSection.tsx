import { Megaphone, TrendingUp, Brain, Bot, ShoppingCart, BarChart3, Users } from "lucide-react";

const highlights = [
  { icon: Megaphone, label: "Marketing Digital" },
  { icon: TrendingUp, label: "Performance" },
  { icon: Brain, label: "Inteligência Artificial" },
  { icon: Bot, label: "Automação" },
  { icon: ShoppingCart, label: "E-commerce" },
  { icon: BarChart3, label: "Dashboards e Dados" },
  { icon: Users, label: "CRM e Funil de Vendas" },
];

const SobreSection = () => {
  return (
    <section id="sobre" className="py-20 lg:py-32 bg-card/40 backdrop-blur-[2px]">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="max-w-4xl mx-auto text-center mb-12">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">Sobre nós</span>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3 mb-6">
            Sobre a <span className="text-gradient-gold">GA Company</span>
          </h2>
          <div className="space-y-5 text-muted-foreground leading-relaxed text-left md:text-center">
            <p>
              A GA Company é uma empresa com mais de 3 anos de atuação no mercado, unindo estratégias de marketing digital, inovação e tecnologia para entregar resultados reais para empresas que desejam crescer, vender mais e melhorar sua operação digital.
            </p>
            <p>
              A empresa vem se destacando pela capacidade de integrar marketing, dados, automação, inteligência artificial e e-commerce em soluções estratégicas para negócios de diferentes segmentos.
            </p>
            <p>
              Nosso foco é construir operações digitais mais inteligentes, conectando campanhas, sites, CRM, dashboards, automações e canais de venda em uma estratégia única, clara e orientada por performance.
            </p>
            <p>
              A GA Company não trabalha apenas com presença digital. Trabalhamos para transformar audiência em relacionamento, relacionamento em oportunidade e oportunidade em resultado.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 md:gap-4 max-w-5xl mx-auto">
          {highlights.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="bg-background/60 border border-border rounded-xl p-4 flex flex-col items-center text-center gap-2 hover:border-primary/40 hover:shadow-[var(--shadow-gold)] transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="text-primary" size={18} />
              </div>
              <span className="text-xs font-semibold text-foreground/90 leading-tight">{label}</span>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <a
            href="#formulario"
            className="inline-flex items-center gap-2 bg-gradient-gold text-primary-foreground px-7 py-3.5 rounded-lg font-semibold hover:opacity-90 transition-opacity"
          >
            Fale com a GA Company
          </a>
        </div>
      </div>
    </section>
  );
};

export default SobreSection;
