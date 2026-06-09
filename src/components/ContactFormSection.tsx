import { useState } from "react";
import { Send, Shield, Clock, CheckCircle, Phone, MessageCircle, Mail } from "lucide-react";

const ContactFormSection = () => {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", telefone: "", empresa: "", segmento: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <section id="formulario" className="py-20 lg:py-32 bg-background relative overflow-hidden">
      <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(ellipse at 50% 0%, hsl(48 100% 50% / 0.08) 0%, transparent 60%)" }} />

      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
          <div>
            <span className="text-primary font-semibold text-sm uppercase tracking-wider">Comece agora</span>
            <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3 mb-6">
              Pronto para <span className="text-gradient-gold">escalar</span> seus resultados?
            </h2>
            <p className="text-muted-foreground mb-8 text-lg">
              Preencha o formulário e receba uma análise gratuita do seu marketing digital. Sem compromisso.
            </p>

            <div className="space-y-4">
              {[
                { icon: Shield, text: "Seus dados estão 100% seguros" },
                { icon: Clock, text: "Retorno em até 24 horas" },
                { icon: CheckCircle, text: "Análise gratuita e sem compromisso" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <Icon className="text-primary" size={20} />
                  <span className="text-muted-foreground">{text}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 p-6 bg-card/50 border border-border rounded-xl">
              <h4 className="font-heading text-lg font-bold text-foreground mb-4">Prefere contato direto?</h4>
              <div className="space-y-3">
                <a href="https://wa.me/5512988334006" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-muted-foreground hover:text-green-400 transition-colors">
                  <MessageCircle size={20} /> (12) 98833-4006 — WhatsApp
                </a>
                <a href="tel:+5512988334006" className="flex items-center gap-3 text-muted-foreground hover:text-primary transition-colors">
                  <Phone size={20} /> (12) 98833-4006 — Ligar
                </a>
                <a href="mailto:growsolucaodigital@gmail.com" className="flex items-center gap-3 text-muted-foreground hover:text-primary transition-colors">
                  <Mail size={20} /> growsolucaodigital@gmail.com
                </a>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-8 lg:p-10 border-glow">
            {submitted ? (
              <div className="text-center py-12">
                <CheckCircle className="text-primary mx-auto mb-4" size={48} />
                <h3 className="font-heading text-2xl font-bold mb-2 text-foreground">Recebemos seu contato!</h3>
                <p className="text-muted-foreground">Nossa equipe entrará em contato em breve.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <h3 className="font-heading text-xl font-bold text-foreground mb-2">Cadastre-se e receba o contato do nosso time</h3>
                {[
                  { name: "nome", placeholder: "Seu nome completo", type: "text" },
                  { name: "email", placeholder: "Seu melhor e-mail", type: "email" },
                  { name: "telefone", placeholder: "WhatsApp com DDD", type: "tel" },
                  { name: "empresa", placeholder: "Nome da sua empresa", type: "text" },
                ].map((field) => (
                  <input
                    key={field.name}
                    type={field.type}
                    placeholder={field.placeholder}
                    required
                    value={form[field.name as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-4 py-3.5 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                  />
                ))}
                <select
                  value={form.segmento}
                  onChange={(e) => setForm({ ...form, segmento: e.target.value })}
                  required
                  className="w-full bg-background border border-border rounded-lg px-4 py-3.5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                >
                  <option value="" className="text-muted-foreground">Selecione seu segmento</option>
                  <option value="ecommerce">E-commerce</option>
                  <option value="servicos">Serviços</option>
                  <option value="saude">Saúde</option>
                  <option value="educacao">Educação</option>
                  <option value="varejo">Varejo</option>
                  <option value="tecnologia">Tecnologia</option>
                  <option value="outro">Outro</option>
                </select>
                <button type="submit" className="w-full bg-gradient-gold text-primary-foreground py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2 hover:opacity-90 transition-all animate-pulse-glow">
                  Quero minha análise gratuita <Send size={20} />
                </button>
                <p className="text-xs text-muted-foreground text-center">
                  Ao enviar, você concorda com nossa política de privacidade.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactFormSection;
