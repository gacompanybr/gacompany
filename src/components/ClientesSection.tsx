import farmaConde from "@/assets/clients/transparent/farma-conde.png";
import farmaCondeWhite from "@/assets/clients/white/farma-conde.png";
import lopes from "@/assets/clients/transparent/lopes.png";
import lopesWhite from "@/assets/clients/white/lopes.png";
import lovitta from "@/assets/clients/transparent/lovitta.png";
import lovittaWhite from "@/assets/clients/white/lovitta.png";
import vilaGym from "@/assets/clients/transparent/vila-gym.png";
import vilaGymWhite from "@/assets/clients/white/vila-gym.png";
import rodsBurguer from "@/assets/clients/transparent/rods-burguer.png";
import rodsBurguerWhite from "@/assets/clients/white/rods-burguer.png";
import mcg from "@/assets/clients/transparent/mcg.png";
import mcgWhite from "@/assets/clients/white/mcg.png";
import cacilia from "@/assets/clients/transparent/cacilia.png";
import caciliaWhite from "@/assets/clients/white/cacilia.png";
import superCleaning from "@/assets/clients/transparent/super-cleaning.png";
import superCleaningWhite from "@/assets/clients/white/super-cleaning.png";
import oarco from "@/assets/clients/transparent/oarco.png";
import oarcoWhite from "@/assets/clients/white/oarco.png";
import garimpaAi from "@/assets/clients/transparent/garimpa-ai.png";
import garimpaAiWhite from "@/assets/clients/white/garimpa-ai.png";

const clients = [
  { name: "Farma Conde", logo: farmaConde, logoWhite: farmaCondeWhite },
  { name: "Oarco", logo: oarco, logoWhite: oarcoWhite },
  { name: "Lopes Saúde e Odontologia", logo: lopes, logoWhite: lopesWhite },
  { name: "Lóvitta", logo: lovitta, logoWhite: lovittaWhite },
  { name: "Vila Gym", logo: vilaGym, logoWhite: vilaGymWhite },
  { name: "Garimpa Aí", logo: garimpaAi, logoWhite: garimpaAiWhite },
  { name: "Rod's Burguer", logo: rodsBurguer, logoWhite: rodsBurguerWhite },
  { name: "MCG", logo: mcg, logoWhite: mcgWhite },
  { name: "Cacilia Imobiliária", logo: cacilia, logoWhite: caciliaWhite },
  { name: "Super Cleaning Inc.", logo: superCleaning, logoWhite: superCleaningWhite },
];

const ClientesSection = () => {
  return (
    <section id="clientes" className="py-20 lg:py-32 bg-background">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-14">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">Quem confia</span>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3">
            Marcas que crescem com a <span className="text-gradient-gold">GA Company</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-8 gap-y-10 items-center">
          {clients.map((c) => (
            <div
              key={c.name}
              className="group relative flex h-16 items-center justify-center md:h-20"
              title={c.name}
            >
              {c.logo ? (
                <img
                  src={c.logo}
                  alt={`Logo ${c.name}`}
                  className="max-h-full max-w-full object-contain"
                  loading="lazy"
                />

              ) : (
                <span className="font-heading font-bold text-base md:text-lg text-muted-foreground hover:text-foreground transition-colors">
                  {c.name}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <a
            href="#formulario"
            className="inline-flex items-center gap-2 border border-primary/40 text-primary px-7 py-3.5 rounded-lg font-semibold hover:bg-primary/10 transition-colors"
          >
            Solicite uma análise
          </a>
        </div>
      </div>
    </section>
  );
};

export default ClientesSection;
