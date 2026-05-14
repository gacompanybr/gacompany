import { PenTool, Megaphone, Search, Radio, Bot, BarChart3, Globe, LineChart, Tag, BadgeCheck } from "lucide-react";

const services = [
  {
    icon: PenTool,
    title: "Conteúdo",
    desc: "Qualidade para alavancar sua presença digital e engajar seu público-alvo por meio de conteúdos estratégicos, criativos e alinhados ao posicionamento da marca.",
  },
  {
    icon: Megaphone,
    title: "Google Ads e Meta Ads",
    desc: "Maximize sua presença online com campanhas focadas em tráfego qualificado, geração de leads, vendas e crescimento real no Google Ads e Meta Ads.",
    badge: "Parceiros Google Ads e Meta Ads",
  },
  {
    icon: Search,
    title: "Análise de SEO",
    desc: "Navegamos pelos caminhos da otimização para mecanismos de busca, melhorando a visibilidade orgânica, estrutura do site e potencial de descoberta da marca.",
  },
  {
    icon: Radio,
    title: "Mídia Programática",
    desc: "Segmentação precisa e assertiva para alcançar o consumidor certo no momento certo, com inteligência de mídia e dados.",
  },
  {
    icon: Bot,
    title: "Automações e Agentes de IA",
    desc: "Agentes de IA focados em vendas e atendimento humanizado para aumentar a conversão, melhorar o relacionamento e apoiar o pós-venda e SAC.",
  },
  {
    icon: BarChart3,
    title: "CRM",
    desc: "Automação e gestão do funil de vendas para maximizar cada oportunidade, organizar leads, acompanhar etapas comerciais e aumentar a conversão.",
  },
  {
    icon: Globe,
    title: "Sites, Landing Pages e E-commerce",
    desc: "Criação de sites institucionais, landing pages e e-commerces com foco em conversão, performance e resultados — geração de leads ou vendas online.",
  },
  {
    icon: LineChart,
    title: "Criação de Dashboards",
    desc: "Dashboards personalizados que trazem visibilidade das campanhas e indicadores em um só lugar, facilitando a tomada de decisão.",
  },
  {
    icon: Tag,
    title: "Configuração de GTM",
    desc: "Configuração do Google Tag Manager para organização de tags, eventos, conversões e rastreamento de performance das campanhas.",
  },
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
          {services.map(({ icon: Icon, title, desc, badge }) => (
            <div key={title} className="group bg-card border border-border rounded-2xl p-8 hover:border-primary/40 transition-all duration-300 hover:shadow-[var(--shadow-gold)]">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors">
                <Icon className="text-primary" size={24} />
              </div>
              <h3 className="font-heading text-xl font-bold mb-3 text-foreground">{title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
              {badge && (
                <div className="mt-4 inline-flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary text-xs font-semibold px-3 py-1.5 rounded-full">
                  <BadgeCheck size={14} /> {badge}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
