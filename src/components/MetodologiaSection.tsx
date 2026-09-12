import { TrendingUp, Zap, Target, CheckCircle2 } from "lucide-react";

const steps = [
  {
    icon: TrendingUp,
    tag: "GROW",
    title: "Aumentar visibilidade real, não vaidade.",
    desc: "A etapa Grow tem como foco ampliar a presença digital da marca de forma estratégica, atraindo pessoas que realmente se identificam com o produto ou serviço. O objetivo não é apenas gerar números, mas construir uma audiência qualificada com potencial real de compra.",
    points: [
      "Aumentar visibilidade real",
      "Atrair pessoas alinhadas ao produto",
      "Construir base de seguidores com potencial de compra",
      "Fortalecer presença digital com estratégia",
    ],
  },
  {
    icon: Zap,
    tag: "ACTIVATE",
    title: "Transformar atenção em interesse real.",
    desc: "A etapa Activate estimula engajamento, resposta e interesse do público. Aqui identificamos quem realmente consome o conteúdo, interage com a marca e demonstra sinais de intenção. O objetivo é criar familiaridade, desejo e confiança antes da oferta direta.",
    points: [
      "Estimular engajamento, resposta e interesse",
      "Identificar quem realmente consome conteúdo",
      "Criar familiaridade com a marca",
      "Gerar desejo e confiança",
    ],
  },
  {
    icon: Target,
    tag: "CONVERT",
    title: "Converter o público certo com a mensagem certa.",
    desc: "A etapa Convert trabalha ofertas direcionadas para públicos já ativados. Utilizamos mensagens diretas, persuasivas e estratégias de remarketing inteligente para transformar interesse em oportunidade real de venda.",
    points: [
      "Ofertas direcionadas ao público ativado",
      "Mensagens diretas e persuasivas",
      "Remarketing inteligente",
      "Aumento de conversão e vendas",
    ],
  },
];

const MetodologiaSection = () => {
  return (
    <section id="metodologia" className="py-20 lg:py-32 bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.08),transparent_60%)]" />

      <div className="container mx-auto px-4 lg:px-8 relative">
        <div className="text-center mb-16">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">Metodologia GAC</span>
          <h2 className="font-heading text-2xl md:text-5xl font-bold mt-3">
            <span className="text-gradient-gold">GROW</span> · <span className="text-gradient-gold">ACTIVATE</span> · <span className="text-gradient-gold">CONVERT</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mt-4">
            Um método próprio para transformar audiência em relacionamento, relacionamento em oportunidade e oportunidade em resultado.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {steps.map(({ icon: Icon, tag, title, desc, points }, i) => (
            <div
              key={tag}
              className="group relative bg-card border border-border rounded-2xl p-8 hover:border-primary/40 transition-all duration-300 hover:shadow-[var(--shadow-gold)]"
            >
              <div className="absolute -top-4 left-8 bg-gradient-gold text-primary-foreground text-xs font-bold tracking-widest px-3 py-1.5 rounded-md">
                0{i + 1} · {tag}
              </div>

              <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5 mt-3 group-hover:bg-primary/20 transition-colors">
                <Icon className="text-primary" size={26} />
              </div>

              <h3 className="font-heading text-xl font-bold mb-3 text-foreground">{title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5">{desc}</p>

              <ul className="space-y-2.5">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-foreground/90">
                    <CheckCircle2 className="text-primary mt-0.5 flex-shrink-0" size={16} />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <a
            href="#formulario"
            className="inline-flex items-center gap-2 bg-gradient-gold text-primary-foreground px-8 py-4 rounded-lg font-semibold hover:opacity-90 transition-opacity"
          >
            Quero crescer minha operação
          </a>
        </div>
      </div>
    </section>
  );
};

export default MetodologiaSection;
