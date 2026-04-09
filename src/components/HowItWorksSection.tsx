import { ClipboardCheck, Phone, Rocket } from "lucide-react";

const steps = [
  { icon: ClipboardCheck, step: "01", title: "Preencha o formulário", desc: "Forneça suas informações e conte sobre seu negócio. É rápido e seguro." },
  { icon: Phone, step: "02", title: "Receba nosso contato", desc: "Em até 24h, um especialista entrará em contato para entender suas necessidades." },
  { icon: Rocket, step: "03", title: "Comece a crescer", desc: "Implementamos a estratégia personalizada e você acompanha os resultados em tempo real." },
];

const HowItWorksSection = () => {
  return (
    <section id="como-funciona" className="py-20 lg:py-32 bg-card">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">Como funciona</span>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3">
            Simples assim: <span className="text-gradient-gold">3 passos</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {steps.map(({ icon: Icon, step, title, desc }, i) => (
            <div key={step} className="relative text-center">
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px bg-border" />
              )}
              <div className="w-24 h-24 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mx-auto mb-6">
                <Icon className="text-primary" size={32} />
              </div>
              <span className="text-primary font-heading text-sm font-bold">{step}</span>
              <h3 className="font-heading text-xl font-bold mt-2 mb-3 text-foreground">{title}</h3>
              <p className="text-muted-foreground text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
