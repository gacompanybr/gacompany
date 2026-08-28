import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useInView, useMotionValue, useTransform, animate, useReducedMotion, type Variants } from "framer-motion";
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
  ChevronDown,
} from "lucide-react";
import logo from "@/assets/logo.png";
import heroPortrait from "@/assets/hero-portrait.png";

import ClientesSection from "@/components/ClientesSection";
import SobreSection from "@/components/SobreSection";


// ==== CONFIG ====
const WHATSAPP = "5512988334006"; // usado em wa.me/{WHATSAPP}
const WHATSAPP_LABEL = "(12) 98833-4006";
const INSTAGRAM = "gacompanybr";
const WA_MSG_BASE = "Olá! Quero aumentar o faturamento do meu negócio.";

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

// ==== TYPEWRITER ====
function TypewriterWords({
  words,
  typingSpeed = 75,
  deletingSpeed = 40,
  pauseAfterType = 1400,
  pauseAfterDelete = 250,
}: {
  words: string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseAfterType?: number;
  pauseAfterDelete?: number;
}) {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) {
      setText(words[0]);
      return;
    }
    const current = words[index % words.length];
    let timeout: ReturnType<typeof setTimeout>;

    if (!deleting && text === current) {
      timeout = setTimeout(() => setDeleting(true), pauseAfterType);
    } else if (deleting && text === "") {
      timeout = setTimeout(() => {
        setDeleting(false);
        setIndex((i) => (i + 1) % words.length);
      }, pauseAfterDelete);
    } else {
      timeout = setTimeout(
        () => {
          setText((prev) =>
            deleting
              ? current.substring(0, prev.length - 1)
              : current.substring(0, prev.length + 1)
          );
        },
        deleting ? deletingSpeed : typingSpeed
      );
    }

    return () => clearTimeout(timeout);
  }, [text, deleting, index, words, typingSpeed, deletingSpeed, pauseAfterType, pauseAfterDelete, reduce]);

  return (
    <span className="inline-flex items-baseline">
      <span className="text-gradient-gold">{text}</span>
      <span
        aria-hidden
        className="inline-block w-[0.08em] h-[0.85em] ml-2 bg-primary translate-y-[0.05em] animate-pulse"
      />
    </span>
  );
}

// ==== HERO ====
function Hero() {
  return (
    <section className="relative min-h-[100svh] flex items-center overflow-hidden pt-24 pb-16">
      {/* background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-card" />
      <div
        className="absolute inset-0 opacity-25"
        style={{
          background:
            "radial-gradient(ellipse at 20% 10%, hsl(37 99% 53% / 0.10), transparent 60%), radial-gradient(ellipse at 90% 80%, hsl(30 100% 40% / 0.08), transparent 55%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(0 0% 100% / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100% / 0.4) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <motion.div
            initial="hidden"
            animate="show"
            variants={stagger}
            className="text-center lg:text-left"
          >
            <motion.div
              variants={fadeUp}
              className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 text-primary rounded-full px-4 py-1.5 mb-6 text-xs md:text-sm font-semibold"
            >
              <Flame size={14} /> Marketing e crescimento para negócios locais
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="font-heading font-semibold tracking-tight text-foreground leading-[1.1]"
            >
              <span className="block text-xl sm:text-2xl md:text-3xl text-muted-foreground font-medium mb-3">
                Seu negócio bombando de clientes
              </span>
              <span className="block text-4xl sm:text-5xl md:text-6xl lg:text-6xl font-extrabold leading-[0.95] uppercase min-h-[1.1em]">
                <TypewriterWords
                  words={[
                    "TODOS OS DIAS",
                    "COM PREVISIBILIDADE",
                    "SEM DEPENDER DE SORTE",
                    "COM MARCA FORTE",
                    "FATURANDO MAIS",
                    "NO AUTOMÁTICO",
                  ]}
                />
              </span>
              <span className="block text-lg sm:text-xl md:text-2xl text-muted-foreground font-medium mt-4">
                Sem depender de sorte, sem depender de indicação.
              </span>
            </motion.h1>

            <motion.div
              variants={fadeUp}
              className="mt-10 flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3 sm:gap-4"
            >
              <PrimaryCTA>Quero aumentar meu faturamento</PrimaryCTA>
              <WhatsCTA />
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="mt-6 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-sm text-muted-foreground"
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

            <motion.p
              variants={fadeUp}
              className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto lg:mx-0"
            >
              Método completo para empresas, clínicas, comércios e deliveries venderem com
              previsibilidade, escalarem faturamento e pararem de depender só do boca a boca.
            </motion.p>
          </motion.div>

          {/* Visual: retrato + cards flutuantes */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="relative mx-auto w-full max-w-[520px]"
          >
            <div
              className="absolute inset-0 rounded-[2rem] opacity-70"
              style={{
                background:
                  "radial-gradient(circle at 30% 30%, hsl(37 99% 53% / 0.22), transparent 65%)",
              }}
            />
            <div className="relative rounded-[2rem] overflow-hidden border border-border bg-background">
              <img
                src={heroPortrait}
                alt="Especialista da GA Company"
                className="w-full h-auto object-cover object-top"
                loading="eager"
              />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
            </div>

            {/* Card flutuante — novo lead */}
            <div className="absolute -left-3 sm:-left-8 top-8 animate-float bg-card/95 backdrop-blur-sm border border-border rounded-xl px-4 py-3 shadow-2xl">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Novo lead
              </p>
              <p className="font-heading text-sm font-bold text-foreground flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> WhatsApp
                recebido
              </p>
            </div>

            {/* Card flutuante — faturamento */}
            <div
              className="absolute -right-3 sm:-right-6 top-1/3 animate-float bg-card/95 backdrop-blur-sm border border-primary/40 rounded-xl px-4 py-3 shadow-[var(--shadow-gold)]"
              style={{ animationDelay: "0.8s" }}
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Faturamento
              </p>
              <p className="font-heading text-lg font-extrabold text-gradient-gold">+167%</p>
            </div>

            {/* Card flutuante — campanhas */}
            <div
              className="absolute -left-2 sm:-left-6 bottom-10 animate-float bg-card/95 backdrop-blur-sm border border-border rounded-xl px-4 py-3 shadow-2xl"
              style={{ animationDelay: "1.4s" }}
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Campanhas ativas
              </p>
              <p className="font-heading text-sm font-bold text-foreground flex items-center gap-2">
                <TrendingUp size={14} className="text-primary" /> ROI médio 12x
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}


// ==== METRICS BAR ====
function MetricsBar() {
  const metrics = [
    { value: 50, prefix: "R$ ", suffix: "M+", label: "em vendas geradas para clientes" },
    { value: 200, prefix: "+", suffix: "", label: "empresas e negócios atendidos" },
    { value: 12, prefix: "", suffix: "x", label: "ROI médio das campanhas" },
    { value: 98, prefix: "", suffix: "%", label: "de clientes satisfeitos" },
  ];
  return (
    <Section className="py-10 md:py-14 border-y border-border bg-card/40">
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
    "Fatura bem num mês e some no seguinte",
    "Depende de indicação e não tem previsibilidade de clientes novos",
    "Vive de promoção e desconto e o lucro nunca aparece",
    "Não sabe de onde vem o próximo cliente — zero previsibilidade",
  ];
  const desejo = [
    "Novos clientes chegando todos os dias, no automático",
    "Recorrência: o mesmo cliente comprando 3, 4 vezes no mês",
    "Crescimento previsível de faturamento, mês após mês",
  ];
  return (
    <Section id="dor" className="py-14 md:py-20 bg-background">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div variants={fadeUp} className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            Se você é dono de negócio, isso é pra você
          </span>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3">
            O que está <span className="text-gradient-gold">travando o crescimento</span> da
            sua empresa
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

// ==== ENTREGAS ====
function EntregasSection() {
  const items = [
    {
      icon: Megaphone,
      title: "Tráfego Pago",
      bullets: ["Google Ads", "Meta Ads", "Campanhas de conversão"],
    },
    {
      icon: ShoppingBag,
      title: "Gestão de canais de venda",
      bullets: ["iFood e marketplaces", "Site próprio otimizado", "Menos dependência de taxa"],
    },
    {
      icon: Utensils,
      title: "Site & Cardápio Digital",
      bullets: ["Loja/site próprio", "Pagamento integrado", "Foco em conversão"],
    },
    {
      icon: MapPin,
      title: "Google Meu Negócio",
      bullets: ["Topo do Google Maps", "Perfil otimizado", "Clientes da sua região"],
    },
    {
      icon: Repeat,
      title: "CRM e fidelização",
      bullets: ["Funil organizado", "Campanhas de recompra", "Cliente voltando mais vezes"],
    },
    {
      icon: Bot,
      title: "Automações & IA",
      bullets: ["Atendimento no WhatsApp", "Recuperação de venda", "Follow-up automático"],
    },
  ];
  return (
    <Section id="servicos" className="py-14 md:py-20 bg-background">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div variants={fadeUp} className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            O que fazemos
          </span>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3">
            Tudo o que seu negócio precisa,{" "}
            <span className="text-gradient-gold">em um só time</span>
          </h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 max-w-5xl mx-auto">
          {items.map(({ icon: Icon, title, bullets }) => (
            <motion.div
              key={title}
              variants={fadeUp}
              whileHover={{ y: -4 }}
              className="bg-card border border-border rounded-2xl p-6 hover:border-primary/40 hover:shadow-[var(--shadow-gold)] transition-all"
            >
              <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Icon className="text-primary" size={20} />
              </div>
              <h3 className="font-heading font-bold text-foreground text-lg">{title}</h3>
              <ul className="mt-3 space-y-2">
                {bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check size={15} className="text-primary mt-0.5 shrink-0" /> {b}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <motion.div variants={fadeUp} className="mt-12 text-center">
          <PrimaryCTA>Quero esses serviços no meu negócio</PrimaryCTA>
        </motion.div>
      </div>
    </Section>
  );
}

// ==== DEPOIMENTOS (carrossel) ====
const depoimentos = [
  {
    nome: "Tadeu Miabara",
    empresa: "Vila GYM",
    texto:
      "A GA Company entendeu exatamente o que precisávamos. Em 3 meses, triplicamos os leads qualificados.",
  },
  {
    nome: "Bruno Lopes",
    empresa: "Lopes Odontologia",
    texto:
      "Profissionalismo e resultado. A equipe é extremamente dedicada e os relatórios são impecáveis.",
  },
  {
    nome: "Adriana Bueno",
    empresa: "GarimpaAí",
    texto:
      "Melhor investimento que fiz para minha empresa. O ROI das campanhas superou todas as expectativas.",
  },
];

const initials = (n: string) =>
  n
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

function Carousel({
  count,
  children,
  label,
}: {
  count: number;
  children: (index: number) => React.ReactNode;
  label: string;
}) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  const go = (dir: number) => {
    setDirection(dir);
    setIndex((p) => (p + dir + count) % count);
  };

  return (
    <div className="relative max-w-xl mx-auto">
      <div className="overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            initial={{ x: direction > 0 ? 60 : -60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction > 0 ? -60 : 60, opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) go(1);
              else if (info.offset.x > 60) go(-1);
            }}
            className="cursor-grab active:cursor-grabbing"
          >
            {children(index)}
          </motion.div>
        </AnimatePresence>
      </div>

      <button
        onClick={() => go(-1)}
        aria-label={`${label} anterior`}
        className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 p-2 rounded-full bg-background border border-border hover:border-primary hover:text-primary transition-colors"
      >
        <ArrowRight className="rotate-180" size={20} />
      </button>
      <button
        onClick={() => go(1)}
        aria-label={`Próximo ${label}`}
        className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 p-2 rounded-full bg-background border border-border hover:border-primary hover:text-primary transition-colors"
      >
        <ArrowRight size={20} />
      </button>

      <div className="flex justify-center gap-2 mt-8">
        {Array.from({ length: count }).map((_, i) => (
          <button
            key={i}
            onClick={() => {
              setDirection(i > index ? 1 : -1);
              setIndex(i);
            }}
            aria-label={`Ver ${label} ${i + 1}`}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === index ? "w-6 bg-primary" : "w-2 bg-border hover:bg-primary/50"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function DepoimentosSection() {
  return (
    <Section id="depoimentos" className="py-14 md:py-20 bg-card">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div variants={fadeUp} className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            Depoimentos
          </span>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3">
            O que nossos <span className="text-gradient-gold">clientes dizem</span>
          </h2>
        </motion.div>

        <Carousel count={depoimentos.length} label="depoimento">
          {(i) => {
            const d = depoimentos[i];
            return (
              <div className="bg-background border border-border rounded-2xl p-6 md:p-8">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="text-primary fill-primary" size={16} />
                  ))}
                </div>
                <p className="text-foreground leading-relaxed mb-6">"{d.texto}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center font-heading font-bold text-primary">
                    {initials(d.nome)}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{d.nome}</p>
                    <p className="text-sm text-muted-foreground">
                      {d.empresa} · Cliente GA Company
                    </p>
                  </div>
                </div>
              </div>
            );
          }}
        </Carousel>
      </div>
    </Section>
  );
}

// ==== FAQ ====
const faqs = [
  {
    q: "Como funciona a análise gratuita?",
    a: "Você preenche o formulário e um especialista chama você no WhatsApp com um diagnóstico dos seus canais de venda e um plano de crescimento para os próximos 90 dias. Sem compromisso.",
  },
  {
    q: "Em quanto tempo vejo resultado?",
    a: "Os primeiros sinais aparecem nas primeiras semanas de campanha. Nos nossos cases, os saltos maiores de faturamento acontecem entre o 3º e o 6º mês, quando tráfego, recorrência e marca já estão rodando juntos.",
  },
  {
    q: "Atendem qualquer segmento?",
    a: "Trabalhamos com empresas, clínicas, comércios, deliveries e e-commerces. Nossos cases vão de hamburgueria e odontologia a gerenciamento de imóveis.",
  },
  {
    q: "Preciso investir em anúncios além do serviço?",
    a: "Sim. O investimento em mídia é separado da assessoria e definido junto com você na análise, de acordo com a meta de faturamento do seu negócio.",
  },
  {
    q: "Vocês cuidam de tudo ou só do tráfego?",
    a: "Cuidamos do ecossistema completo: tráfego pago, canais de venda, site e cardápio digital, Google Meu Negócio, CRM e fidelização, automações e IA — tudo em um só time.",
  },
];

function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Section id="faq" className="py-14 md:py-20 bg-background">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div variants={fadeUp} className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            Dúvidas frequentes
          </span>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3">
            Perguntas <span className="text-gradient-gold">frequentes</span>
          </h2>
        </motion.div>

        <div className="max-w-3xl mx-auto space-y-3">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <motion.div
                key={f.q}
                variants={fadeUp}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between gap-4 text-left px-5 md:px-6 py-4 md:py-5"
                >
                  <span className="font-heading font-bold text-foreground">{f.q}</span>
                  <ChevronDown
                    size={20}
                    className={`shrink-0 text-primary transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 md:px-6 pb-5 text-muted-foreground leading-relaxed">
                        {f.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}


// ==== PROVA ====
const cases = [
  {
    nome: "Rod's Burger",
    segmento: "Delivery / Hamburgueria",
    antes: "R$ 45k",
    depois: "R$ 120k",
    crescimento: "+167%",
    quote: "Estruturamos o cardápio, cortamos dependência do iFood e ligamos as campanhas certas. Virou outro negócio.",
  },
  {
    nome: "Clínica Lopes Saúde",
    segmento: "Odontologia",
    antes: "R$ 50k",
    depois: "R$ 90k",
    crescimento: "+80%",
    quote: "Agenda cheia, pacientes novos toda semana. Hoje temos previsibilidade real de faturamento.",
  },
  {
    nome: "Burger On The Grill",
    segmento: "Hamburgueria artesanal",
    antes: "R$ 5k",
    depois: "R$ 20k",
    crescimento: "+300%",
    quote: "Em poucos meses quadruplicamos o faturamento. A operação virou uma máquina de vender.",
  },
  {
    nome: "OArco",
    segmento: "GERENCIONAMENTO DE IMÓVEIS",
    antes: "R$ 213k",
    depois: "R$ 458k",
    crescimento: "+115%",
    quote: "Escalamos de forma previsível. A GA entregou estrutura, tráfego e método pra crescer com solidez.",
  },
];

function CaseCard({ c }: { c: (typeof cases)[number] }) {
  return (
    <div className="bg-background border border-border rounded-2xl p-6 md:p-8 hover:border-primary/40 hover:shadow-[var(--shadow-gold)] transition-all flex flex-col h-full">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="font-heading font-bold text-foreground text-lg leading-tight">
            {c.nome}
          </p>
          <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">
            {c.segmento}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="text-primary fill-primary" size={14} />
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground italic leading-relaxed mb-6">
        "{c.quote}"
      </p>

      <div className="mt-auto grid grid-cols-3 gap-2 items-stretch">
        <div className="rounded-xl p-3 text-center border border-border bg-card/60">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Antes</p>
          <p className="font-heading text-lg md:text-xl font-extrabold text-foreground">{c.antes}</p>
        </div>
        <div className="rounded-xl p-3 text-center border border-border bg-card/60 flex flex-col items-center justify-center">
          <ArrowRight className="text-primary" size={18} />
          <p className="font-heading text-sm font-bold text-primary mt-1">{c.crescimento}</p>
        </div>
        <div className="rounded-xl p-3 text-center border border-primary/50 bg-primary/5 shadow-[var(--shadow-gold)]">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Depois</p>
          <p className="font-heading text-lg md:text-xl font-extrabold text-primary">{c.depois}</p>
        </div>
      </div>
    </div>
  );
}

function ProvaSection() {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: false, amount: 0.3 });

  const next = () => {
    setDirection(1);
    setIndex((prev) => (prev + 1) % cases.length);
  };

  const prev = () => {
    setDirection(-1);
    setIndex((prev) => (prev - 1 + cases.length) % cases.length);
  };

  const goTo = (i: number) => {
    setDirection(i > index ? 1 : -1);
    setIndex(i);
  };

  useEffect(() => {
    if (!inView) return;
    autoRef.current = setInterval(next, 4500);
    return () => {
      if (autoRef.current) clearInterval(autoRef.current);
    };
  }, [inView]);

  return (
    <Section id="prova" className="py-14 md:py-20 bg-card">
      <div ref={sectionRef} className="container mx-auto px-4 lg:px-8">
        <motion.div variants={fadeUp} className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">Casos reais</span>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3">
            Resultados que <span className="text-gradient-gold">viraram o jogo</span>
          </h2>
          <p className="text-muted-foreground mt-4">
            Empresas de diferentes segmentos escalando faturamento com o método GA.
          </p>
        </motion.div>

        <div className="relative max-w-xl mx-auto">
          <div className="overflow-hidden">
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={index}
                custom={direction}
                initial={{ x: direction > 0 ? 60 : -60, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction > 0 ? -60 : 60, opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                <CaseCard c={cases[index]} />
              </motion.div>
            </AnimatePresence>
          </div>

          <button
            onClick={prev}
            aria-label="Case anterior"
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 md:-translate-x-12 p-2 rounded-full bg-background border border-border hover:border-primary hover:text-primary transition-colors"
          >
            <ArrowRight className="rotate-180" size={20} />
          </button>
          <button
            onClick={next}
            aria-label="Próximo case"
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 md:translate-x-12 p-2 rounded-full bg-background border border-border hover:border-primary hover:text-primary transition-colors"
          >
            <ArrowRight size={20} />
          </button>
        </div>

        <div className="flex justify-center gap-2 mt-8">
          {cases.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Ver case ${i + 1}`}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === index ? "w-6 bg-primary" : "w-2 bg-border hover:bg-primary/50"
              }`}
            />
          ))}
        </div>

        <motion.div variants={fadeUp} className="mt-12 text-center">
          <PrimaryCTA>Quero um resultado assim</PrimaryCTA>
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
      `Olá! Quero aumentar o faturamento do meu negócio.%0A%0A` +
      `*Nome:* ${form.nome}%0A` +
      `*WhatsApp:* ${form.whatsapp}%0A` +
      `*Instagram:* @${form.instagram.replace(/^@/, "")}%0A` +
      `*Faturamento/mês:* ${form.faturamento}`;
    window.open(`https://wa.me/${WHATSAPP}?text=${msg}`, "_blank");
    setSubmitted(true);
  };

  return (
    <Section id="formulario" className="py-14 md:py-20 bg-background relative overflow-hidden">
      <span id="forms" className="absolute -top-24" aria-hidden />
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
              Bora fazer seu negócio{" "}
              <span className="text-gradient-gold">bombar</span>?
            </h2>
            <p className="text-muted-foreground text-lg mb-8">
              Preencha os dados abaixo. Um especialista chama você no WhatsApp com uma
              análise personalizada da sua empresa — sem compromisso.
            </p>
            <ul className="space-y-3">
              {[
                "Diagnóstico dos seus canais de venda",
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
                  <label htmlFor="insta" className="sr-only">Instagram do negócio</label>
                  <div className="flex items-center bg-background border border-border rounded-lg focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 transition-all">
                    <span className="pl-4 text-muted-foreground">
                      <Instagram size={18} />
                    </span>
                    <input
                      id="insta"
                      type="text"
                      required
                      placeholder="@ do seu negócio"
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
                    <option value="">Faturamento mensal da empresa</option>
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
    <Section className="py-14 md:py-20 relative overflow-hidden">
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
            Comece agora, sem compromisso. Análise gratuita do seu negócio em minutos.
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
      <FormSection />
      <ClientesSection />
      <DepoimentosSection />
      <EntregasSection />
      <ProvaSection />
      <DorSection />
      <SobreSection />
      <FaqSection />
      <Footer />
      <FloatingWhats />
    </>
  );
}
