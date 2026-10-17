# Apps independentes e carregamento por perfil

O proprietário confirmou que o Chrome Android permitia instalar apenas um dos três aplicativos. A configuração anterior separava manifests e caminhos, mas mantinha todos na mesma origem. O guia oficial do Chrome recomenda origens distintas para aplicativos independentes, pois o isolamento apenas por caminho mantém limitações de instalação, captura de links e permissões.

| Aplicativo | Entrada de instalação | Origem |
| --- | --- | --- |
| Cliente | https://pedetrem.vercel.app/cliente/entrar | `https://pedetrem.vercel.app` |
| Estabelecimento | https://pedetrem-loja.vercel.app/estabelecimento/entrar | `https://pedetrem-loja.vercel.app` |
| Entregador | https://pedetrem-entregador.vercel.app/entregador/entrar | `https://pedetrem-entregador.vercel.app` |

Os dois endereços novos foram adicionados e verificados no projeto Vercel `wifomedelivery`, conta WS. Usam o mesmo código e backend; nenhum domínio foi comprado. São domínios de produção do projeto, acompanhando os próximos deploys. O endereço raiz da loja e do entregador recebe redirect temporário específico por hostname para seu próprio login, mantendo os parâmetros.

Os links de entrada da landing page apontam para a origem de cada perfil. Ao tocar no banner de instalação em um endereço antigo/compartilhado, o usuário é encaminhado ao endereço próprio. O prompt somente pode ser usado se origem, manifesto e caminho do documento inicial corresponderem ao perfil. A oferta nativa é capturada no carregamento do módulo, antes da montagem do banner, para continuar disponível caso o navegador a emita durante uma tela de carregamento. Os manifests associam somente o próprio aplicativo. IDs, caminhos e ícones aprovados permanecem; instalações antigas continuam acessíveis.

As sessões locais passam a ser independentes entre as origens. O usuário entra novamente com a mesma conta nos novos endereços da loja e do entregador. Nenhuma senha ou sessão é copiada entre domínios. As contas, permissões e dados continuam no Supabase `nsvgfagjezdduatmbsqq`.

A configuração Auth foi consultada antes e depois da alteração: Site URL canônica `https://pedetrem.vercel.app` e quatro padrões adicionais, limitados às rotas de autenticação e recuperação nos dois novos hosts. Todos os retornos anteriores foram preservados; o comparativo dos demais campos confirmou que permaneceram iguais. O hook Brevo aceita essas origens exatas e continua recusando hosts semelhantes ou externos. Não houve alteração de schema, SMTP ou credenciais, nem envio real de e-mail nesta etapa.

## Carregamento laranja na página vermelha

O problema foi reproduzido renderizando os componentes reais de React/TanStack: ao iniciar uma navegação, o endereço mais recente muda antes de o estado da rota anterior ser substituído. O loader usava esse estado antigo e mostrava a marca da loja ao voltar à landing page. Agora usa `router.latestLocation` e define explicitamente `theme-cliente` para o cliente, resetando cores herdadas. Um perfil explícito de onboarding continua tendo precedência.

## Evidências e limites

- Os testes de carregamento falharam com o logo anterior e passaram após o ajuste. Cobrem loja → landing page, cliente → entregador e perfil explícito.
- Os testes de origem falharam com o endereço compartilhado e passaram com isolamento. Cobrem também a rejeição de uma oferta da loja no domínio do cliente.
- O teste de oferta antecipada cobre retenção antes do banner, consumo/limpeza e recusa para outro perfil.
- Testes reais de montagem dos e-mails preservam os retornos de cadastro e recuperação nas três origens e recusam hosts falsos semelhantes.
- Suíte completa: 137 testes aprovados. TypeScript e lint sem avisos aprovados. Build Node e verificações HTTP locais dos três perfis aprovados; HTML da landing page contém as três entradas independentes.
- Revisão independente não encontrou problemas Critical/Important; 8 testes focados aprovados pelo revisor.
- `scripts/check-independent-apps.mjs` consulta a publicação real e verifica origens, redirects, query strings, HTML inicial, identidade, associação própria, ícones e worker. Falhou na publicação anterior porque a landing page apontava para as entradas compartilhadas; a execução após publicar precisa confirmar a correção.

A instalação física lado a lado no Android e no iPhone não foi observada nesta sessão. O navegador compartilhado não está conectado. Os testes de React e router usam os componentes reais, mas não substituem o teste do instalador do celular. A validação real do retorno por e-mail também permanece fora desta etapa; nenhum e-mail foi enviado para terceiros.

Fonte principal: [Chrome — múltiplos PWAs no mesmo domínio](https://web.dev/articles/building-multiple-pwas-on-the-same-domain). Configuração de retornos: [Supabase Auth](https://supabase.com/docs/guides/auth/redirect-urls).

## Publicação confirmada

Aplicação publicada em `685f1d70ad17affd5971e9be7a07ca125b18ce8e`, deployment de produção `dpl_3nKyFk65fZ39kRSnPpRVjBzm9pRr`. Build remoto em 28 segundos; domínio principal confirmado às 03:13 UTC de 2026-10-17. A consulta de logs de erro dos últimos 15 minutos retornou zero entradas nesse deployment.

`node scripts/check-independent-apps.mjs` passou nas três origens reais: HTTPS, entradas próprias, redirects de raiz, parâmetros preservados, HTML com manifesto correto antes de JavaScript, IDs distintos por origem, associação somente ao próprio app, ícones e worker. `node scripts/check-pwa-http.mjs https://pedetrem.vercel.app` também passou, mantendo os links antigos e o retorno `confirmado=1`. Os 454 arquivos preparados para deploy não incluíram arquivos privados; 316 arquivos públicos foram conferidos contra os segredos efetivos do projeto, sem exposição encontrada.

A consulta final da configuração remota confirmou os três domínios verificados no mesmo projeto WS, Site URL canônica e os quatro padrões adicionais de retorno. A confirmação física de coinstalação e de retorno real por e-mail continua pendente, conforme os limites acima.
