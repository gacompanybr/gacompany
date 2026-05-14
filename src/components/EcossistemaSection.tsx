import { ArrowRight } from "lucide-react";
import logo from "@/assets/logo.png";

const platforms = [
  { name: "Google Ads", slug: "googleads", domain: "ads.google.com", top: "8%", left: "8%" },
  { name: "Meta Ads", slug: "meta", domain: "meta.com", top: "5%", left: "55%" },
  { name: "VTEX", slug: "vtex", domain: "vtex.com", top: "28%", left: "78%" },
  { name: "Nuvemshop", slug: "nuvemshop", domain: "nuvemshop.com.br", top: "52%", left: "82%" },
  { name: "Bling", slug: "bling", domain: "bling.com.br", top: "75%", left: "65%" },
  { name: "Lovable", slug: "lovable", domain: "lovable.dev", top: "82%", left: "20%" },
  { name: "Mercado Livre", slug: "mercadolibre", domain: "mercadolivre.com.br", top: "55%", left: "-2%" },
  { name: "Amazon", slug: "amazon", domain: "amazon.com.br", top: "28%", left: "-4%" },
  { name: "Shopee", slug: "shopee", domain: "shopee.com.br", top: "92%", left: "42%" },
];

const stats = [
  { value: "+3 anos", label: "de experiência no mercado" },
  { value: "Marketing + Tecnologia", label: "estratégia integrada para crescimento" },
  { value: "IA + Automação", label: "operações mais inteligentes e escaláveis" },
  { value: "Performance", label: "visibilidade, conversão e resultado" },
];

const EcossistemaSection = () => {
  return (
    <section id="ecossistema" className="py-20 lg:py-32 bg-card relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,hsl(var(--primary)/0.06),transparent_55%)]" />

      <div className="container mx-auto px-4 lg:px-8 relative">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Visual */}
          <div className="relative aspect-square max-w-[520px] w-full mx-auto">
            {/* Concentric rings */}
            <div className="absolute inset-0 rounded-full border border-border/60" />
            <div className="absolute inset-[10%] rounded-full border border-border/40" />
            <div className="absolute inset-[22%] rounded-full border border-primary/15 bg-primary/[0.03]" />

            {/* Central logo */}
            <div className="absolute inset-[28%] rounded-full bg-background border border-primary/30 shadow-[var(--shadow-gold)] flex items-center justify-center p-6">
              <img src={logo} alt="GA Company" className="w-full h-auto object-contain" />
            </div>

            {/* Floating platform chips */}
            {platforms.map((p, i) => (
              <div
                key={p.name}
                className="absolute bg-background border border-border rounded-full pl-2 pr-4 py-2 shadow-lg hover:border-primary/50 hover:shadow-[var(--shadow-gold)] transition-all animate-float flex items-center gap-2"
                style={{
                  top: p.top,
                  left: p.left,
                  animationDelay: `${i * 0.4}s`,
                }}
              >
                <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center flex-shrink-0 overflow-hidden text-[10px] font-bold text-black">
                  <img
                    src={`https://cdn.simpleicons.org/${p.slug}`}
                    alt={p.name}
                    className="w-3.5 h-3.5 object-contain"
                    loading="lazy"
                    onError={(e) => {
                      const parent = e.currentTarget.parentElement as HTMLElement;
                      e.currentTarget.style.display = "none";
                      parent.textContent = p.name.charAt(0);
                    }}
                  />
                </span>
                <span className="text-xs md:text-sm font-semibold text-foreground whitespace-nowrap">{p.name}</span>
              </div>
            ))}
          </div>

          {/* Text */}
          <div>
            <span className="text-primary font-semibold text-sm uppercase tracking-wider">Ecossistema</span>
            <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3 mb-5">
              Ecossistema <span className="text-gradient-gold">GA Company</span>
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              O ecossistema GA Company conecta estratégia, mídia, tecnologia, dados e canais de venda para construir operações digitais mais inteligentes, integradas e orientadas por resultado.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-8">
              Estamos conectados às principais plataformas de anúncios, e-commerce, automação, marketplaces e análise de dados para transformar campanhas em crescimento real.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {stats.map((s) => (
                <div key={s.value} className="border border-border bg-background/40 rounded-xl p-4 hover:border-primary/30 transition-colors">
                  <div className="font-heading text-lg font-bold text-primary leading-tight">{s.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            <a
              href="#formulario"
              className="inline-flex items-center gap-2 bg-gradient-gold text-primary-foreground px-7 py-3.5 rounded-lg font-semibold hover:opacity-90 transition-opacity"
            >
              Fale conosco <ArrowRight size={18} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default EcossistemaSection;
