import { Instagram, Linkedin, Mail, Phone, MessageCircle } from "lucide-react";
import logo from "@/assets/logo.png.asset.json";

const FooterSection = () => {
  return (
    <footer className="bg-card border-t border-border py-12">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid md:grid-cols-3 gap-8 items-center">
          <div>
            <img src={logo.url} alt="GA Company" className="h-10 w-auto" />
            <p className="text-muted-foreground text-sm mt-2">Assessoria de Marketing Digital que gera resultados reais.</p>
          </div>

          <div className="flex items-center justify-center gap-4">
            <a href="https://www.instagram.com/gacompanybr/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors">
              <Instagram size={18} />
            </a>
            <a href="https://www.linkedin.com/company/growassessoria/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors">
              <Linkedin size={18} />
            </a>
            <a href="mailto:growsolucaodigital@gmail.com" className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors">
              <Mail size={18} />
            </a>
            <a href="https://wa.me/5512988334006" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-green-400 hover:border-green-400/50 transition-colors">
              <MessageCircle size={18} />
            </a>
          </div>

          <div className="text-right space-y-2">
            <a href="tel:+5512988334006" className="flex items-center justify-end gap-2 text-muted-foreground hover:text-primary transition-colors text-sm">
              <Phone size={16} /> (12) 98833-4006
            </a>
            <a href="https://wa.me/5512988334006" target="_blank" rel="noopener noreferrer" className="flex items-center justify-end gap-2 text-muted-foreground hover:text-green-400 transition-colors text-sm">
              <MessageCircle size={16} /> WhatsApp
            </a>
            <p className="text-xs text-muted-foreground mt-4">© 2025 GA Company. Todos os direitos reservados.</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default FooterSection;
