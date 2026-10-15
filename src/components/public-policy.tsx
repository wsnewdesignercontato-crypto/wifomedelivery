import { Link } from "@tanstack/react-router";
import { IFomeLogo } from "@/components/ifome-logo";

export function PublicPolicy({ kind }: { kind: "privacy" | "terms" }) {
  const privacy = kind === "privacy";
  const sections = privacy
    ? [
        [
          "Dados usados no serviço",
          "O PedeTrem utiliza dados de cadastro e autenticação, contato, endereços, pedidos, mensagens e avaliações para operar o delivery. Cadastros de lojas e entregadores também podem incluir documentos de identificação, veículo e dados para repasses.",
        ],
        [
          "Entrega e localização",
          "O endereço e os dados necessários ao atendimento são disponibilizados aos participantes do pedido. A localização do entregador pode ser usada durante sua disponibilidade e a entrega. O uso de localização e notificações depende das permissões do dispositivo, que podem ser gerenciadas no navegador.",
        ],
        [
          "Prestadores de serviço",
          "A aplicação utiliza serviços de hospedagem e banco de dados para guardar e processar informações. Mapas carregam conteúdo de provedores externos. Links de navegação podem abrir aplicativos externos, sujeitos às políticas desses serviços.",
        ],
        [
          "Armazenamento no dispositivo",
          "O navegador pode guardar a sessão, preferências e informações da instalação do aplicativo. Ao usar um dispositivo compartilhado, saia da conta após o uso. As configurações de privacidade do navegador permitem gerenciar esse armazenamento.",
        ],
        [
          "Solicitações sobre seus dados",
          "Use a Central de ajuda da sua conta para solicitar informações sobre os dados armazenados, correção ou exclusão. A equipe responsável avaliará o pedido e eventuais necessidades de conservação dos registros. Não envie senhas nem códigos de autenticação nas mensagens.",
        ],
      ]
    : [
        [
          "Uso da plataforma",
          "O PedeTrem conecta clientes, estabelecimentos e entregadores. Use dados corretos no cadastro, mantenha suas credenciais protegidas e confira os dados do pedido antes de confirmar. Cadastros de operação estão sujeitos à análise administrativa.",
        ],
        [
          "Pedidos e disponibilidade",
          "Preços, opções, disponibilidade, entrega ou retirada e cupons são conferidos antes da confirmação. Mudanças no carrinho exigem nova conferência. A loja acompanha e atualiza as etapas do atendimento; o cliente pode consultar o andamento em Pedidos.",
        ],
        [
          "Pagamento",
          "Os meios disponíveis são apresentados no checkout. Pix, cartão na entrega e dinheiro devem ser combinados com o estabelecimento no atendimento. A seleção de uma opção no aplicativo não equivale a uma cobrança online. A carteira não está disponível como forma de pagamento neste checkout.",
        ],
        [
          "Cancelamentos e atendimento",
          "As ações disponíveis dependem da etapa do pedido. Para tratar problemas de entrega, cancelamento ou pagamento, consulte o pedido e a Central de ajuda. O código de entrega deve ser informado somente no momento do recebimento.",
        ],
        [
          "Conduta e equipe",
          "Não utilize o serviço para fraudes, pedidos falsos, assédio ou acesso indevido a contas. Convites de equipe devem ser aceitos pela conta com o e-mail confirmado da pessoa convidada e permitem consultar pedidos das lojas autorizadas.",
        ],
      ];
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-10">
      <Link to="/" aria-label="Página inicial do PedeTrem">
        <IFomeLogo size="md" />
      </Link>
      <h1 className="text-3xl font-bold">
        {privacy ? "Política de privacidade" : "Termos de uso"}
      </h1>
      <p className="text-sm text-muted-foreground">
        Informações sobre o funcionamento do PedeTrem. Atualizado em 15 de outubro de 2026.
      </p>
      {sections.map(([title, body]) => (
        <section key={title} className="space-y-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
        </section>
      ))}
      <nav
        className="flex flex-wrap gap-5 border-t pt-5 text-sm text-primary"
        aria-label="Documentos e atendimento"
      >
        <Link to="/">Início</Link>
        <Link to={privacy ? "/termos" : "/privacidade"}>
          {privacy ? "Termos de uso" : "Privacidade"}
        </Link>
        <Link to="/cliente/perfil/ajuda">Central de ajuda</Link>
      </nav>
    </main>
  );
}
