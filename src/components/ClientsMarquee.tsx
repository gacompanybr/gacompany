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

type ClientsMarqueeProps = {
  compact?: boolean;
};

const ClientsMarquee = ({ compact = false }: ClientsMarqueeProps) => {
  const loop = [...clients, ...clients];

  return (
    <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div className={`flex w-max animate-marquee items-center group-hover:[animation-play-state:paused] motion-reduce:animate-none ${compact ? "gap-8 pr-8" : "gap-12 pr-12 md:gap-20 md:pr-20"}`}>
        {loop.map((client, index) => (
          <div
            key={`${client.name}-${index}`}
            title={client.name}
            className={`flex shrink-0 items-center justify-center ${compact ? "h-14 w-14 sm:h-16 sm:w-16" : "h-20 w-20 md:h-28 md:w-28"}`}
            aria-hidden={index >= clients.length}
          >
            <img
              src={client.logo}
              alt={`Logo ${client.name}`}
              className={client.circular ? "h-full w-full rounded-full object-cover" : "max-h-full max-w-full object-contain"}
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ClientsMarquee;