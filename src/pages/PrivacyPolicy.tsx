import { Link } from "react-router-dom";
import logo from "@/assets/logo.png.asset.json";

const PrivacyPolicy = () => (
  <main className="min-h-screen bg-background text-foreground">
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <Link to="/" className="inline-flex items-center" aria-label="Voltar para a página inicial">
        <img src={logo.url} alt="GA Company" className="h-9 w-auto" />
      </Link>

      <article className="mt-10 space-y-8">
        <header>
          <p className="text-sm font-semibold uppercase text-primary">Privacidade</p>
          <h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl">Política de Privacidade</h1>
          <p className="mt-3 text-sm text-muted-foreground">Última atualização: 15 de setembro de 2026.</p>
        </header>

        <section className="space-y-3">
          <h2 className="font-heading text-xl font-semibold">Dados informados no formulário</h2>
          <p className="leading-7 text-muted-foreground">
            Usamos nome, WhatsApp, Instagram e faixa de faturamento para responder ao pedido de análise e iniciar o atendimento solicitado pelo visitante.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-xl font-semibold">Medição de anúncios</h2>
          <p className="leading-7 text-muted-foreground">
            Em regiões onde isso é permitido sem consentimento prévio, usamos o Pixel da Meta para medir visitas e o envio do formulário como uma conversão chamada “Lead”. A Meta pode receber informações técnicas, como endereço IP, navegador, dispositivo, página visitada e o evento realizado. Não enviamos à Meta os dados digitados no formulário.
          </p>
          <p className="leading-7 text-muted-foreground">
            O Pixel é bloqueado em regiões que exigem consentimento, quando a localização não pode ser confirmada e quando o navegador comunica uma preferência de não rastreamento aplicável.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-xl font-semibold">Compartilhamento e finalidade</h2>
          <p className="leading-7 text-muted-foreground">
            A Meta Platforms é destinatária dos dados técnicos de medição para atribuição de campanhas e análise do desempenho dos anúncios. Os dados do formulário são usados pela GA Company para atendimento comercial e não são incluídos nos eventos do Pixel.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-xl font-semibold">Seus direitos e contato</h2>
          <p className="leading-7 text-muted-foreground">
            Você pode solicitar acesso, correção ou exclusão dos seus dados pelo e-mail{" "}
            <a className="text-primary underline" href="mailto:growsolucaodigital@gmail.com">growsolucaodigital@gmail.com</a>.
            Também pode usar os controles de privacidade e de rastreamento do seu navegador.
          </p>
        </section>

        <Link to="/" className="inline-flex text-sm font-semibold text-primary underline">
          Voltar para o site
        </Link>
      </article>
    </div>
  </main>
);

export default PrivacyPolicy;