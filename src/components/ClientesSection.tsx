import farmaConde from "@/assets/clients/transparent/farma-conde.png";
import lopes from "@/assets/clients/transparent/lopes.png";
import lovitta from "@/assets/clients/transparent/lovitta.png";
import vilaGym from "@/assets/clients/transparent/vila-gym.png";
import rodsBurguer from "@/assets/clients/transparent/rods-burguer.png";
import mcg from "@/assets/clients/transparent/mcg.png";
import cacilia from "@/assets/clients/transparent/cacilia.png";
import superCleaning from "@/assets/clients/transparent/super-cleaning.png";
import oarco from "@/assets/clients/transparent/oarco.png";
import garimpaAi from "@/assets/clients/transparent/garimpa-ai.png";

const clients = [
  { name: "Farma Conde", logo: farmaConde },
  { name: "Oarco", logo: oarco },
  { name: "Lopes Saúde e Odontologia", logo: lopes },
  { name: "Lóvitta", logo: lovitta },
  { name: "Vila Gym", logo: vilaGym },
  { name: "Garimpa Aí", logo: garimpaAi },
  { name: "Rod's Burguer", logo: rodsBurguer },
  { name: "MCG", logo: mcg },
  { name: "Cacilia Imobiliária", logo: cacilia },
  { name: "Super Cleaning Inc.", logo: superCleaning },
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

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6 md:gap-8">
          {clients.map((c) => (
            <div
              key={c.name}
              title={c.name}
              className="group flex h-24 md:h-28 items-center justify-center transition-transform duration-300 hover:-translate-y-1"
            >
              <img
                src={c.logo}
                alt={`Logo ${c.name}`}
                className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
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
