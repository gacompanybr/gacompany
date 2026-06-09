import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Tadeu Miabara",
    role: "Vila GYM",
    text: "A GA Company entendeu exatamente o que precisávamos. Em 3 meses, triplicamos os leads qualificados.",
  },
  {
    name: "Bruno Lopes",
    role: "Lopes Odontologia",
    text: "Profissionalismo e resultado. A equipe é extremamente dedicada e os relatórios são impecáveis.",
  },
  {
    name: "Adriana",
    role: "GarimpaAI",
    text: "Melhor investimento que fiz para minha empresa. O ROI das campanhas superou todas as expectativas.",
  },
];

const TestimonialsSection = () => {
  return (
    <section id="depoimentos" className="py-20 lg:py-32 bg-background">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">Depoimentos</span>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3">
            O que nossos <span className="text-gradient-gold">clientes dizem</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div key={t.name} className="bg-card border border-border rounded-2xl p-8 hover:border-primary/30 transition-all">
              <div className="flex gap-1 mb-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="text-primary fill-primary" size={16} />
                ))}
              </div>
              <p className="text-foreground mb-6 leading-relaxed">"{t.text}"</p>
              <div>
                <p className="font-semibold text-foreground">{t.name}</p>
                <p className="text-sm text-muted-foreground">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
