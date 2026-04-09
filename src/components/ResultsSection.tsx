const results = [
  { value: "R$ 50M+", label: "Em vendas geradas para nossos clientes" },
  { value: "200+", label: "Empresas atendidas em todo o Brasil" },
  { value: "12x", label: "ROI médio das campanhas" },
  { value: "3 anos", label: "De experiência comprovada" },
];

const ResultsSection = () => {
  return (
    <section id="resultados" className="py-20 lg:py-32 bg-card">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">Números que falam</span>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3">
            Resultados que <span className="text-gradient-gold">comprovam</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {results.map(({ value, label }) => (
            <div key={label} className="text-center p-8 rounded-2xl border border-border bg-background/50 hover:border-primary/30 transition-all">
              <div className="font-heading text-3xl md:text-4xl font-bold text-primary mb-3">{value}</div>
              <p className="text-muted-foreground text-sm">{label}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 bg-secondary/30 border border-border rounded-2xl p-8 lg:p-12">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <h3 className="font-heading text-2xl md:text-3xl font-bold mb-4">
                "Nosso faturamento cresceu <span className="text-primary">340%</span> em 6 meses"
              </h3>
              <p className="text-muted-foreground mb-4">
                Com a assessoria da GA Company, conseguimos estruturar nosso funil de vendas e escalar as campanhas de tráfego com previsibilidade.
              </p>
              <div>
                <p className="font-semibold text-foreground">Carlos Mendes</p>
                <p className="text-sm text-muted-foreground">CEO — TechStore Brasil</p>
              </div>
            </div>
            <div className="flex gap-4 justify-center">
              {[
                { label: "Antes", val: "R$ 45k/mês" },
                { label: "Depois", val: "R$ 198k/mês" },
              ].map(({ label, val }) => (
                <div key={label} className={`flex-1 rounded-xl p-6 text-center border ${label === "Depois" ? "border-primary/50 bg-primary/5" : "border-border bg-background/30"}`}>
                  <p className="text-sm text-muted-foreground mb-2">{label}</p>
                  <p className={`font-heading text-2xl font-bold ${label === "Depois" ? "text-primary" : "text-foreground"}`}>{val}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ResultsSection;
