import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Check, MessageCircle, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { initializeMetaPixel, trackMetaLead } from "@/lib/metaPixel";

const WHATSAPP = "5512988334006";

const platforms = [
  { name: "iFood", accent: true },
  { name: "99Food", accent: true },
  { name: "Uber Eats" },
  { name: "Rappi", accent: true },
  { name: "Delivery Much" },
  { name: "aiqfome", accent: true },
];

const fieldClass =
  "h-12 w-full rounded-lg border border-border bg-background px-4 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20";

function PlatformStrip() {
  const repeated = [...platforms, ...platforms];

  return (
    <div className="overflow-hidden border-y border-border bg-secondary/30 py-3 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div className="flex w-max animate-marquee items-center gap-10 pr-10 motion-reduce:animate-none">
        {repeated.map((platform, index) => (
          <div
            key={`${platform.name}-${index}`}
            className="flex h-7 w-24 shrink-0 items-center justify-center opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0"
            aria-hidden={index >= platforms.length}
          >
            <span className={`whitespace-nowrap font-heading text-sm font-bold ${platform.accent ? "text-primary" : "text-foreground"}`}>
              {platform.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const RestaurantForms = () => {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    whatsapp: "",
    negocio: "",
    instagram: "",
    plataforma: "",
    faturamento: "",
  });

  useEffect(() => {
    document.title = "Marketing para Restaurantes e Delivery | GA Company";
    void initializeMetaPixel();
  }, []);

  const maskPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = [
      "Olá! Quero aumentar os pedidos do meu restaurante/delivery.",
      "",
      `*Nome:* ${form.nome}`,
      `*WhatsApp:* ${form.whatsapp}`,
      `*Restaurante/Delivery:* ${form.negocio}`,
      `*Instagram:* @${form.instagram.replace(/^@/, "")}`,
      `*Plataforma principal:* ${form.plataforma}`,
      `*Faturamento mensal:* ${form.faturamento}`,
    ].join("\n");

    void trackMetaLead();
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    setSubmitted(true);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div aria-hidden="true" className="fixed inset-0 -z-10 bg-vector-grid" />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.14),transparent_68%)]" />

      <header className="relative z-10 border-b border-border/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="GA Company — página inicial">
            <img src="/icon-192.png" alt="GA Company" className="h-9 w-9 object-contain sm:h-10 sm:w-10" />
          </Link>
          <a
            href={`https://wa.me/${WHATSAPP}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
          >
            <MessageCircle size={17} />
            <span className="hidden sm:inline">Falar com um especialista</span>
            <span className="sm:hidden">WhatsApp</span>
          </a>
        </div>
      </header>

      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-8 px-4 py-8 sm:px-6 md:py-12 lg:grid-cols-[1fr_0.9fr] lg:gap-14">
        <section>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase text-primary">
            <Store size={14} /> Especialistas em food service
          </div>
          <h1 className="max-w-2xl font-heading text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            Mais pedidos para seu <span className="text-gradient-gold">restaurante ou delivery.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Descubra onde sua operação perde vendas e receba um plano direto para atrair clientes, aumentar o ticket e vender mais todos os dias.
          </p>

          <ul className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {[
              "Análise gratuita da operação",
              "Estratégia para delivery próprio e apps",
              "Mais recorrência e menos dependência",
              "Contato rápido pelo WhatsApp",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-sm text-foreground/90">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Check size={14} />
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-8 hidden items-center gap-3 border-l-2 border-primary pl-4 text-sm text-muted-foreground lg:flex">
            <BarChart3 className="text-primary" size={22} />
            Estratégia baseada nos números reais do seu negócio.
          </div>
        </section>

        <section aria-labelledby="form-title" className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-gold)]">
          <div className="px-5 pb-4 pt-6 sm:px-7">
            <p className="text-xs font-semibold uppercase text-primary">Análise sem compromisso</p>
            <h2 id="form-title" className="mt-1 font-heading text-2xl font-bold sm:text-3xl">
              Quero vender mais no delivery
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">Preencha e continue o atendimento pelo WhatsApp.</p>
          </div>

          <PlatformStrip />

          <div className="p-5 sm:p-7">
            {submitted ? (
              <div className="flex min-h-80 flex-col items-center justify-center text-center">
                <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                  <Check size={28} />
                </span>
                <h3 className="font-heading text-2xl font-bold">Tudo certo!</h3>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">Seu WhatsApp foi aberto com os dados preenchidos. Basta enviar a mensagem.</p>
                <Button asChild className="mt-6">
                  <a href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer">
                    Abrir WhatsApp <MessageCircle />
                  </a>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="grid gap-3.5">
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <label className="sr-only" htmlFor="restaurant-name">Seu nome</label>
                  <input id="restaurant-name" required autoComplete="name" placeholder="Seu nome" className={fieldClass} value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} />
                  <label className="sr-only" htmlFor="restaurant-whatsapp">WhatsApp</label>
                  <input id="restaurant-whatsapp" required inputMode="tel" autoComplete="tel" placeholder="WhatsApp com DDD" className={fieldClass} value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: maskPhone(event.target.value) })} />
                </div>
                <label className="sr-only" htmlFor="restaurant-business">Nome do restaurante ou delivery</label>
                <input id="restaurant-business" required placeholder="Nome do restaurante ou delivery" className={fieldClass} value={form.negocio} onChange={(event) => setForm({ ...form, negocio: event.target.value })} />
                <label className="sr-only" htmlFor="restaurant-instagram">Instagram do negócio</label>
                <input id="restaurant-instagram" required placeholder="@ do Instagram" className={fieldClass} value={form.instagram} onChange={(event) => setForm({ ...form, instagram: event.target.value.replace(/\s/g, "") })} />
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <label className="sr-only" htmlFor="restaurant-platform">Plataforma principal</label>
                  <select id="restaurant-platform" required className={fieldClass} value={form.plataforma} onChange={(event) => setForm({ ...form, plataforma: event.target.value })}>
                    <option value="">Plataforma principal</option>
                    <option>iFood</option>
                    <option>99Food</option>
                    <option>Rappi</option>
                    <option>Delivery próprio</option>
                    <option>Outra</option>
                  </select>
                  <label className="sr-only" htmlFor="restaurant-revenue">Faturamento mensal</label>
                  <select id="restaurant-revenue" required className={fieldClass} value={form.faturamento} onChange={(event) => setForm({ ...form, faturamento: event.target.value })}>
                    <option value="">Faturamento mensal</option>
                    <option>Até R$ 30 mil</option>
                    <option>R$ 30 a 60 mil</option>
                    <option>R$ 60 a 100 mil</option>
                    <option>Acima de R$ 100 mil</option>
                  </select>
                </div>
                <Button type="submit" className="mt-1 h-13 w-full bg-gradient-gold py-4 text-base font-bold text-primary-foreground hover:opacity-90">
                  Receber minha análise <ArrowRight />
                </Button>
                <p className="text-center text-xs leading-5 text-muted-foreground">
                  Ao enviar, você concorda com a nossa{" "}
                  <Link to="/politica-de-privacidade" className="underline transition-colors hover:text-primary">Política de Privacidade</Link>.
                </p>
              </form>
            )}
          </div>
        </section>
      </div>

      <footer className="relative z-10 border-t border-border/70 py-5 text-center text-xs text-muted-foreground">
        © 2026 GA Company · Marketing para restaurantes e delivery
      </footer>
    </main>
  );
};

export default RestaurantForms;