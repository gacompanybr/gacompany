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
import fisioCorpus from "@/assets/clients/transparent/fisio-corpus.png";
import candlesMimos from "@/assets/clients/transparent/candles-mimos.png";
import burgerOnTheGrill from "@/assets/clients/transparent/burger-on-the-grill.png";
import ceyaAsset from "@/assets/clients/transparent/ceya.png.asset.json";
import primeRefeicoesAsset from "@/assets/clients/transparent/prime-refeicoes.png.asset.json";
import saborAgridoceAsset from "@/assets/clients/transparent/sabor-agridoce.png.asset.json";
import vaeliAsset from "@/assets/clients/transparent/vaeli.png.asset.json";

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
  { name: "Academia Fisio Corpus", logo: fisioCorpus },
  { name: "Candles & Mimos by Ari", logo: candlesMimos },
  { name: "Burger on the Grill", logo: burgerOnTheGrill },
  { name: "Ceya Supermercado", logo: ceyaAsset.url },
  { name: "Prime Refeições", logo: primeRefeicoesAsset.url, circular: true },
  { name: "Sabor Agridoce", logo: saborAgridoceAsset.url, circular: true },
  { name: "Vaeli Modas", logo: vaeliAsset.url, circular: true },
];

const ClientesSection = () => {
  const loop = [...clients, ...clients];

  return (
    <section id="clientes" className="py-20 lg:py-32 bg-background">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-14">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">Quem confia</span>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mt-3">
            Marcas que crescem com a <span className="text-gradient-gold">GA Company</span>
          </h2>
        </div>

        <div
          className="group relative overflow-hidden"
          style={{
            maskImage:
              "linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)",
          }}
        >
          <div className="flex w-max animate-marquee gap-12 md:gap-20 group-hover:[animation-play-state:paused]">
            {loop.map((c, i) => (
              <div
                key={`${c.name}-${i}`}
                title={c.name}
                className="flex h-20 w-20 md:h-28 md:w-28 shrink-0 items-center justify-center"
              >
                <img
                  src={c.logo}
                  alt={`Logo ${c.name}`}
                  className={
                    c.circular
                      ? "h-full w-full rounded-full object-cover"
                      : "max-h-full max-w-full object-contain"
                  }
                  loading="lazy"
                />
              </div>
            ))}
          </div>
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
