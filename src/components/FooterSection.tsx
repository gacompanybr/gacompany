import { Instagram, Linkedin, Mail, Phone } from "lucide-react";
import logo from "@/assets/logo.png";

const FooterSection = () => {
  return (
    <footer className="bg-card border-t border-border py-12">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid md:grid-cols-3 gap-8 items-center">
          <div>
            <img src={logo} alt="GA Company" className="h-10 w-auto" />
            <p className="text-muted-foreground text-sm mt-2">Assessoria de Marketing Digital que gera resultados reais.</p>
          </div>

          <div className="flex items-center justify-center gap-4">
            {[Instagram, Linkedin, Mail].map((Icon, i) => (
              <a key={i} href="#" className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors">
                <Icon size={18} />
              </a>
            ))}
          </div>

          <div className="text-right">
            <a href="tel:+5511999999999" className="flex items-center justify-end gap-2 text-muted-foreground hover:text-primary transition-colors text-sm">
              <Phone size={16} /> (11) 99999-9999
            </a>
            <p className="text-xs text-muted-foreground mt-4">© 2025 GA Company. Todos os direitos reservados.</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default FooterSection;
