import { useEffect, useRef, useState } from "react";
import { motion, useInView, useMotionValue, useTransform, animate, useReducedMotion, type Variants } from "framer-motion";
import {
  ArrowRight,
  MessageCircle,
  Check,
  X,
  Flame,
  Repeat,
  Megaphone,
  TrendingUp,
  Instagram,
  MapPin,
  ShoppingBag,
  Utensils,
  Bot,
  Sparkles,
  Star,
  ShieldCheck,
  Clock,
} from "lucide-react";
import logo from "@/assets/logo.png";
import EcossistemaSection from "@/components/EcossistemaSection";
import ClientesSection from "@/components/ClientesSection";

// ==== CONFIG ====
const WHATSAPP = "5512988334006"; // usado em wa.me/{WHATSAPP}
const WHATSAPP_LABEL = "(12) 98833-4006";
const INSTAGRAM = "gacompanybr";
const WA_MSG_BASE = "Olá! Quero aumentar o faturamento do meu delivery.";

const waLink = (msg = WA_MSG_BASE) =>
  `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;

// ==== HELPERS ====
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

function Section({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      id={id}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      variants={stagger}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  duration = 1.8,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v).toLocaleString("pt-BR"));
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration, ease: "easeOut" });
    return controls.stop;
  }, [inView, value, duration, mv, reduce]);

  return (
    <span ref={ref}>
      {prefix}
      <motion.span>{rounded}</motion.span>
      {suffix}
    </span>
  );
}

// ==== CTA button ====
function PrimaryCTA({
  children,
  href = "#formulario",
  className = "",
}: {
  children: React.ReactNode;
  href?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`group inline-flex items-center justify-center gap-2 bg-gradient-gold text-primary-foreground font-bold text-base md:text-lg px-7 md:px-9 py-4 md:py-5 rounded-xl shadow-[var(--shadow-gold)] hover:shadow-[var(--shadow-gold-lg)] hover:scale-[1.02] active:scale-[0.98] transition-all ${className}`}
    >
      {children}
      <ArrowRight
        size={20}
        className="transition-transform group-hover:translate-x-1"
      />
    </a>
  );
}

function WhatsCTA({
  children = "Falar no WhatsApp",
  className = "",
  msg,
}: {
  children?: React.ReactNode;
  className?: string;
  msg?: string;
}) {
  return (
    <a
      href={waLink(msg)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 border border-border text-foreground font-semibold px-6 md:px-8 py-4 md:py-5 rounded-xl hover:border-green-400 hover:text-green-400 transition-colors ${className}`}
    >
      <MessageCircle size={20} /> {children}
    </a>
  );
}

// ==== FLOATING WHATSAPP ====
function FloatingWhats() {
  return (
    <a
      href={waLink()}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className="fixed bottom-5 right-5 z-50 group"
    >
      <span className="absolute inset-0 rounded-full bg-green-500 opacity-60 animate-ping" />
      <span className="relative flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full bg-green-500 text-white shadow-2xl hover:scale-110 transition-transform">
        <MessageCircle size={26} />
      </span>
    </a>
  );
}

// ==== HERO ====
function Hero() {
  return (
    <section className="relative min-h-[100svh] flex items-center overflow-hidden pt-24 pb-16">
      {/* background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-card" />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at 20% 10%, hsl(37 99% 53% / 0.15), transparent 60%), radial-gradient(ellipse at 90% 80%, hsl(30 100% 40% / 0.12), transparent 55%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(0 0% 100% / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100% / 0.4) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <motion.div
          initial="hidden"
          animate="show"
          variants={stagger}
          className="max-w-4xl mx-auto text-center"
        >
          <motion.div
            variants={fadeUp}
            className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 text-primary rounded-full px-4 py-1.5 mb-6 text-xs md:text-sm font-semibold"
          >
            <Flame size={14} /> Marketing para delivery e restaurante
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="font-heading text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight"
          >
            Mais pedidos no seu delivery{" "}
            <span className="text-gradient-gold">todos os dias</span> —
            não só no fim de semana.
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            Método completo para hamburguerias, pizzarias e restaurantes venderem com
            previsibilidade, escalarem faturamento e pararem de depender só do iFood.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4"
          >
            <PrimaryCTA>Quero aumentar meu faturamento</PrimaryCTA>
            <WhatsCTA />
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={16} className="text-primary" /> Análise gratuita
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock size={16} className="text-primary" /> Resposta em minutos no WhatsApp
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Star size={16} className="text-primary fill-primary" /> +200 negócios atendidos
            </span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

// ==== METRICS BAR ====
function MetricsBar() {
  const metrics = [
    { value: 50, prefix: "R$ ", suffix: "M+", label: "em vendas geradas para clientes" },
    { value: 200, prefix: "+", suffix: "", label: "deliveries e restaurantes atendidos" },
    { value: 12, prefix: "", suffix: "x", label: "ROI médio das campanhas" },
    { value: 98, prefix: "", suffix: "%", label: "de clientes satisfeitos" },
  ];
  return (
    <Section className="py-14 md:py-20 border-y border-border bg-card/40">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-4">
          {metrics.map((m) => (
            <motion.div
              key={m.label}
              variants={fadeUp}
              className="text-center px-2"
            >
              <div className="font-heading text-3xl md:text-5xl font-extrabold text-gradient-gold">
                <AnimatedNumber value={m.value} prefix={m.prefix} suffix={m.suffix} />
              </div>
              <p className="mt-2 text-xs md:text-sm text-muted-foreground leading-tight">
                {m.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ==== DOR ====
function DorSection() {
  const dores = [
    "Fatura bem no fim de semana e some no meio da semana",
    "Depende do iFood, paga taxa alta e não tem cliente próprio",
    "Vive de promoção pra vender e o lucro nunca aparece",
    "Não sabe de onde vem o próximo pedido — zero previsibilidade",
  ];
  const desejo = [
    "Novos clientes chegando todos os dias, no automático",
    "Recorrência: o mesmo cliente pedindo 3, 4 vezes no mês",
    "Crescimento previsível de faturamento, mês após mês",
  ];
  return (
    <Section id="dor" className="py-20 md:py-28 bg-background">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div variants={fadeUp} className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            Se você é dono de delivery, isso é pra você
          </span>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3">
            O que está <span className="text-gradient-gold">travando os pedidos</span> do
            seu delivery
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6 md:gap-8 max-w-5xl mx-auto">
          <motion.div
            variants={fadeUp}
            className="bg-card border border-border rounded-2xl p-6 md:p-8"
          >
            <h3 className="font-heading text-xl font-bold mb-5 flex items-center gap-2">
              <X className="text-red-400" size={22} /> Hoje você vive assim
            </h3>
            <ul className="space-y-3">
              {dores.map((d) => (
                <li key={d} className="flex items-start gap-3 text-muted-foreground">
                  <X
                    size={18}
                    className="text-red-400/80 mt-1 shrink-0"
                  />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="bg-gradient-to-br from-primary/10 to-transparent border border-primary/30 rounded-2xl p-6 md:p-8"
          >
            <h3 className="font-heading text-xl font-bold mb-5 flex items-center gap-2">
              <Check className="text-primary" size={22} /> Com a GA, passa a ser assim
            </h3>
            <ul className="space-y-3">
              {desejo.map((d) => (
                <li key={d} className="flex items-start gap-3 text-foreground">
                  <Check size={18} className="text-primary mt-1 shrink-0" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <PrimaryCTA className="w-full sm:w-auto">Quero esse cenário</PrimaryCTA>
            </div>
          </motion.div>
        </div>
      </div>
    </Section>
  );
}

// ==== MECANISMO ====
function MecanismoSection() {
  const pilares = [
    {
      icon: Megaphone,
      title: "Novos clientes",
      desc: "Tráfego pago no Google, Instagram e iFood Ads pra encher seu delivery de pedidos novos toda semana.",
    },
    {
      icon: Repeat,
      title: "Recorrência",
      desc: "CRM, cardápio digital e campanhas de fidelização pra fazer o mesmo cliente pedir de novo, e de novo.",
    },
    {
      icon: Sparkles,
      title: "Marca e autoridade",
      desc: "Conteúdo estratégico no Instagram e Google Meu Negócio pra ser o delivery lembrado na sua região.",
    },
    {
      icon: TrendingUp,
      title: "Ticket médio",
      desc: "Combos, upsell no cardápio e ofertas inteligentes pra cada pedido valer mais sem esforço extra.",
    },
  ];
  return (
    <Section id="metodo" className="py-20 md:py-28 bg-card">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div variants={fadeUp} className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            O método
          </span>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3">
            Como fazemos seu delivery{" "}
            <span className="text-gradient-gold">crescer de verdade</span>
          </h2>
          <p className="text-muted-foreground mt-4">
            4 motores trabalhando juntos, criando uma máquina de pedidos previsível.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
          {pilares.map(({ icon: Icon, title, desc }, i) => (
            <motion.div
              key={title}
              variants={fadeUp}
              whileHover={{ y: -6 }}
              className="relative bg-background border border-border rounded-2xl p-6 md:p-7 hover:border-primary/40 hover:shadow-[var(--shadow-gold)] transition-all"
            >
              <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-gradient-gold text-primary-foreground font-heading font-bold flex items-center justify-center text-sm">
                {i + 1}
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Icon className="text-primary" size={24} />
              </div>
              <h3 className="font-heading text-lg font-bold text-foreground mb-2">
                {title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.div variants={fadeUp} className="mt-12 text-center">
          <PrimaryCTA>Quero esse método no meu delivery</PrimaryCTA>
        </motion.div>
      </div>
    </Section>
  );
}

// ==== ENTREGAS ====
function EntregasSection() {
  const items = [
    { icon: Megaphone, title: "Tráfego Pago", desc: "Google Ads, Meta Ads e iFood Ads" },
    { icon: ShoppingBag, title: "Gestão de iFood", desc: "Otimização de vitrine, ranking e promos" },
    { icon: Utensils, title: "Cardápio Digital", desc: "Cardápio próprio com pagamento — fuja da taxa" },
    { icon: MapPin, title: "Google Meu Negócio", desc: "Apareça no topo do Google Maps da sua região" },
    { icon: Repeat, title: "CRM e fidelização", desc: "Campanhas pra fazer o cliente pedir de novo" },
    { icon: Bot, title: "Automações & IA", desc: "Atendimento no WhatsApp e recuperação de pedido" },
  ];
  return (
    <Section id="entregas" className="py-20 md:py-28 bg-background">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div variants={fadeUp} className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            O que entregamos
          </span>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3">
            Tudo o que seu delivery precisa,{" "}
            <span className="text-gradient-gold">em um só time</span>
          </h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 max-w-5xl mx-auto">
          {items.map(({ icon: Icon, title, desc }) => (
            <motion.div
              key={title}
              variants={fadeUp}
              whileHover={{ scale: 1.02 }}
              className="flex gap-4 bg-card border border-border rounded-xl p-5 hover:border-primary/40 transition-all"
            >
              <div className="w-11 h-11 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="text-primary" size={20} />
              </div>
              <div>
                <h3 className="font-heading font-bold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ==== PROVA ====
function ProvaSection() {
  return (
    <Section id="prova" className="py-20 md:py-28 bg-card">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div variants={fadeUp} className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            Caso real
          </span>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3">
            Resultado que <span className="text-gradient-gold">virou o jogo</span>
          </h2>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="max-w-5xl mx-auto bg-background border border-border rounded-2xl p-6 md:p-10"
        >
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <div className="flex gap-1 mb-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="text-primary fill-primary" size={18} />
                ))}
              </div>
              <h3 className="font-heading text-2xl md:text-3xl font-bold mb-4">
                "Nosso faturamento cresceu{" "}
                <span className="text-primary">340%</span> em 6 meses."
              </h3>
              <p className="text-muted-foreground mb-6">
                {/* TODO: substituir por depoimento real de cliente do nicho delivery */}
                Estruturamos o cardápio digital, tiramos a dependência do iFood e ligamos
                as campanhas certas. A previsibilidade mudou tudo.
              </p>
              <div>
                <p className="font-semibold text-foreground">
                  {`{{PREENCHER: Nome do cliente}}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {`{{PREENCHER: Nome do delivery / cidade}}`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Antes", val: "R$ 45k", tag: "faturamento/mês" },
                { label: "Depois", val: "R$ 198k", tag: "faturamento/mês", hi: true },
              ].map((s) => (
                <div
                  key={s.label}
                  className={`rounded-xl p-6 text-center border ${
                    s.hi
                      ? "border-primary/50 bg-primary/5 shadow-[var(--shadow-gold)]"
                      : "border-border bg-card/50"
                  }`}
                >
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                    {s.label}
                  </p>
                  <p
                    className={`font-heading text-3xl md:text-4xl font-extrabold ${
                      s.hi ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {s.val}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{s.tag}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 text-center">
            <PrimaryCTA>Quero um resultado assim</PrimaryCTA>
          </div>
        </motion.div>
      </div>
    </Section>
  );
}

// ==== FORM ====
function FormSection() {
  const [form, setForm] = useState({
    nome: "",
    whatsapp: "",
    instagram: "",
    faturamento: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const maskPhone = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: conectar ao backend/Supabase/webhook (envio real do lead)
    const msg =
      `Olá! Quero aumentar o faturamento do meu delivery.%0A%0A` +
      `*Nome:* ${form.nome}%0A` +
      `*WhatsApp:* ${form.whatsapp}%0A` +
      `*Instagram:* @${form.instagram.replace(/^@/, "")}%0A` +
      `*Faturamento/mês:* ${form.faturamento}`;
    window.open(`https://wa.me/${WHATSAPP}?text=${msg}`, "_blank");
    setSubmitted(true);
  };

  return (
    <Section id="formulario" className="py-20 md:py-28 bg-background relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, hsl(37 99% 53% / 0.12) 0%, transparent 60%)",
        }}
      />
      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-10 md:gap-14 items-center max-w-6xl mx-auto">
          <motion.div variants={fadeUp}>
            <span className="text-primary font-semibold text-sm uppercase tracking-wider">
              Análise gratuita
            </span>
            <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3 mb-5 leading-tight">
              Bora fazer seu delivery{" "}
              <span className="text-gradient-gold">bombar</span>?
            </h2>
            <p className="text-muted-foreground text-lg mb-8">
              Preencha os dados abaixo. Um especialista chama você no WhatsApp com uma
              análise personalizada do seu delivery — sem compromisso.
            </p>
            <ul className="space-y-3">
              {[
                "Diagnóstico do seu iFood e cardápio",
                "Plano de crescimento para os próximos 90 dias",
                "Resposta em minutos no WhatsApp",
              ].map((t) => (
                <li key={t} className="flex items-center gap-3 text-foreground">
                  <Check size={18} className="text-primary shrink-0" /> {t}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="bg-card border border-border rounded-2xl p-6 md:p-10 shadow-[var(--shadow-gold)]"
          >
            {submitted ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mb-4">
                  <Check className="text-primary" size={30} />
                </div>
                <h3 className="font-heading text-2xl font-bold mb-2">Tudo certo!</h3>
                <p className="text-muted-foreground">
                  Abrimos o WhatsApp com seus dados. Se não abriu,{" "}
                  <a href={waLink()} className="text-primary underline">
                    clique aqui
                  </a>
                  .
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="font-heading text-xl md:text-2xl font-bold mb-2">
                  Receba o contato do nosso time
                </h3>

                <div>
                  <label htmlFor="nome" className="sr-only">Nome</label>
                  <input
                    id="nome"
                    type="text"
                    required
                    placeholder="Seu nome"
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-4 py-3.5 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="whats" className="sr-only">WhatsApp</label>
                  <input
                    id="whats"
                    type="tel"
                    required
                    placeholder="WhatsApp — (00) 00000-0000"
                    value={form.whatsapp}
                    onChange={(e) =>
                      setForm({ ...form, whatsapp: maskPhone(e.target.value) })
                    }
                    className="w-full bg-background border border-border rounded-lg px-4 py-3.5 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="insta" className="sr-only">Instagram do delivery</label>
                  <div className="flex items-center bg-background border border-border rounded-lg focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 transition-all">
                    <span className="pl-4 text-muted-foreground">
                      <Instagram size={18} />
                    </span>
                    <input
                      id="insta"
                      type="text"
                      required
                      placeholder="@ do seu delivery"
                      value={form.instagram}
                      onChange={(e) =>
                        setForm({ ...form, instagram: e.target.value.replace(/\s/g, "") })
                      }
                      className="w-full bg-transparent px-3 py-3.5 text-foreground placeholder:text-muted-foreground outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="fat" className="sr-only">Faixa de faturamento</label>
                  <select
                    id="fat"
                    required
                    value={form.faturamento}
                    onChange={(e) => setForm({ ...form, faturamento: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-4 py-3.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                  >
                    <option value="">Faturamento mensal do delivery</option>
                    <option value="0-50k">R$ 0 – 50 mil</option>
                    <option value="50-100k">R$ 50 – 100 mil</option>
                    <option value="100-200k">R$ 100 – 200 mil</option>
                    <option value="+200k">Acima de R$ 200 mil</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full bg-gradient-gold text-primary-foreground py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2 hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] transition-all shadow-[var(--shadow-gold)]"
                >
                  Quero minha análise gratuita <ArrowRight size={20} />
                </button>
                <p className="text-xs text-muted-foreground text-center">
                  Sem compromisso · resposta pelo WhatsApp · análise personalizada
                </p>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    </Section>
  );
}

// ==== CTA FINAL ====
function CtaFinal() {
  return (
    <Section className="py-20 md:py-28 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-gold" />
      <div
        className="absolute inset-0 opacity-20 mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(0,0,0,0.4), transparent 50%), radial-gradient(circle at 80% 80%, rgba(0,0,0,0.4), transparent 50%)",
        }}
      />
      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <motion.div variants={fadeUp} className="max-w-3xl mx-auto text-center text-primary-foreground">
          <h2 className="font-heading text-3xl md:text-5xl lg:text-6xl font-extrabold leading-tight">
            Todo dia sem estratégia é dia de pedido perdido.
          </h2>
          <p className="mt-4 text-lg md:text-xl opacity-90">
            Comece agora, sem compromisso. Análise gratuita do seu delivery em minutos.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="#formulario"
              className="inline-flex items-center gap-2 bg-background text-foreground font-bold text-lg px-8 py-4 rounded-xl hover:scale-[1.03] active:scale-[0.98] transition-transform"
            >
              Quero minha análise <ArrowRight size={20} />
            </a>
            <a
              href={waLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border-2 border-background/60 text-primary-foreground font-semibold px-7 py-4 rounded-xl hover:bg-background/10 transition-colors"
            >
              <MessageCircle size={20} /> Chamar no WhatsApp
            </a>
          </div>
        </motion.div>
      </div>
    </Section>
  );
}

// ==== FOOTER ====
function Footer() {
  return (
    <footer className="bg-card border-t border-border py-10">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src={logo} alt="GA Company" className="h-9 w-auto" />
          </div>
          <div className="flex items-center gap-4">
            <a
              href={`https://instagram.com/${INSTAGRAM}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
            >
              <Instagram size={18} />
            </a>
            <a
              href={waLink()}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-green-400 hover:border-green-400/50 transition-colors"
            >
              <MessageCircle size={18} />
            </a>
          </div>
          <div className="text-xs text-muted-foreground text-center md:text-right">
            <p>São José dos Campos · SP</p>
            <p>WhatsApp {WHATSAPP_LABEL}</p>
            <p className="mt-1">© {new Date().getFullYear()} GA Company. Todos os direitos reservados.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ==== MAIN ====
export default function DeliveryLanding() {
  return (
    <>
      <Hero />
      <MetricsBar />
      <DorSection />
      <MecanismoSection />
      <EntregasSection />
      <ProvaSection />
      <FormSection />
      <CtaFinal />
      <Footer />
      <FloatingWhats />
    </>
  );
}
