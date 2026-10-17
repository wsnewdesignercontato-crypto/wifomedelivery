# Instalação por perfil e painel Aplicativos

Complementa a auditoria `pwa-audit-2026-10-17.md`, após novo relato do proprietário. A instalação simultânea em um aparelho físico ainda não foi observada nesta sessão.

## Falhas confirmadas

- A barra de cada área também mostrava links dos outros dois aplicativos, contrariando a separação solicitada. Agora cada barra oferece exclusivamente o perfil atual; não há barra residual quando esse perfil está instalado.
- Tentar instalar era tratado como escolher “Agora não”: até a abertura das instruções adiava o convite por sete dias. A tentativa agora só fecha o convite. O adiamento ocorre ao dispensar explicitamente o convite ou recusar a janela nativa.
- O registro anterior exigia autenticação. Instalações nas páginas de login e por visitantes não chegavam ao backend. O novo observador público registra evidência por aplicativo/identificador aleatório; a associação à conta continua separada e exige autenticação.
- Não havia módulo administrativo de instalações. `/admin/aplicativos` agora apresenta os três perfis, instalações ativas observadas, histórico, contas identificadas e ranking, sem expor identificadores individuais.

## Clique e instalação

Foram executados os componentes React reais num DOM simulado, em processos independentes para cada origem. Nos três perfis: uma oferta nativa é acionada uma vez pelo clique; sem oferta, o clique abre instruções visíveis; o convite automático aparece junto da barra; `appinstalled` remove a barra. Tentar instalar não adia o convite. Esses testes não executam o instalador real do Android ou do iOS.

A barra apresenta espera enquanto a janela nativa está ativa e informa quando o clique abre instruções. As instruções distinguem iPhone/Safari de Android/Chrome. O site não pode fabricar a janela nativa quando o navegador não disponibiliza `beforeinstallprompt`. Clique e aceitação da oferta não são contabilizados como instalação concluída.

As três origens, IDs, manifests e ícones independentes da auditoria anterior foram preservados. O nome no launcher continua PedeTrem nos três, como solicitado.

## Banco e contagem

Migração `20261017140535_observe_pwa_installs_and_admin_metrics.sql`, somente no Supabase wifome `nsvgfagjezdduatmbsqq`.

`pwa_install_observations` e suas duas funções são exclusivas do servidor com `service_role`. A observação HTTP exige Origin HTTPS e host do perfil correspondente. A consulta agregada verifica autenticação e papel admin antes de carregar o cliente privilegiado. RLS permanece habilitada e nenhum cliente anônimo/autenticado acessa diretamente a tabela ou as funções novas.

A chave é aplicativo + UUID aleatório local. Repetições não duplicam instalações. Registros autenticados antigos são conciliados por essa chave; a primeira consulta negativa desativa inclusive instalações antigas confirmadas. Visitantes sem confirmação não criam registros negativos. Datas vêm do servidor. A fila aguarda as duas gravações antes de avançar, com nova tentativa após foco/reconexão em caso de erro.

Instalações são observações declaradas pelo navegador, não prova do sistema operacional nem contagem exata de pessoas. Limpar armazenamento pode gerar outro UUID. Desinstalações só atualizam o estado quando o navegador permite consultá-las. Instalações antigas sem observação não podem ser recuperadas retroativamente; aparecem quando o app envia confirmação.

## Verificação

- 195 testes automatizados passaram, incluindo SQL/RLS, perfil/origem, gravação de visitante, autorização administrativa, conciliação sem duplicação e transição histórica para desinstalado.
- TypeScript, ESLint sem avisos e revisão independente aprovados.
- Migração remota aplicada: RLS e restrições verificadas; contagens de contas, lojas e pedidos preservadas. Advisor retornou apenas a informação esperada de RLS sem políticas na tabela exclusiva do servidor.
- Validação física dos três ícones/WebAPKs simultâneos permanece pendente; verificações HTTP e build não substituem esse teste.
