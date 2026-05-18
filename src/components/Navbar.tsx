import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import logo from "@/assets/logo.png";

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const links = [
    { label: "Serviços", href: "#servicos" },
    { label: "Metodologia", href: "#metodologia" },
    { label: "Ecossistema", href: "#ecossistema" },
    { label: "Clientes", href: "#clientes" },
    { label: "Sobre", href: "#sobre" },
  ];

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-background/95 backdrop-blur-md border-b border-border" : "bg-transparent"}`}>
      <div className="container mx-auto px-4 lg:px-8 flex items-center justify-between h-16 lg:h-20">
        <a href="#" className="flex items-center">
          <img src={logo} alt="GA Company" className="h-10 lg:h-12 w-auto" />
        </a>

        <div className="hidden md:flex items-center gap-8">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">
              {link.label}
            </a>
          ))}
          <a href="/painel" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            Área do Cliente
          </a>
          <a href="#formulario" className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">
            Fale Conosco
          </a>
        </div>

        <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden text-foreground">
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-background/98 backdrop-blur-md border-b border-border px-4 pb-6">
          {links.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className="block py-3 text-muted-foreground hover:text-primary transition-colors">
              {link.label}
            </a>
          ))}
          <a href="/painel" onClick={() => setMenuOpen(false)} className="block py-3 text-muted-foreground hover:text-primary transition-colors">
            Área do Cliente
          </a>
          <a href="#formulario" onClick={() => setMenuOpen(false)} className="block mt-4 bg-primary text-primary-foreground px-6 py-3 rounded-lg text-sm font-semibold text-center">
            Fale Conosco
          </a>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
