# PedeTrem / wifomedelivery

Aplicação React e TanStack Start com SSR e funções de servidor. A Vercel hospeda o aplicativo; o Supabase mantém banco, autenticação, arquivos e realtime.

Produção: [wifomedelivery.vercel.app](https://wifomedelivery.vercel.app). Estado das integrações e verificações em [migration-status.md](docs/migration-status.md).

## Desenvolvimento

Use Node.js 24 e Bun 1.4.3. Instale as dependências preservando o lockfile:

```sh
bun install --frozen-lockfile
```

Copie `.env.example` para `.env.local` e configure seu projeto Supabase. Variáveis `VITE_*` são públicas. A chave administrativa do Supabase e as credenciais privadas dos serviços ficam somente nas variáveis de servidor.

```sh
npm run test
npm run typecheck
npm run lint
npm run build
npm run preview
```

O build local gera um servidor Node em `.output/server/index.mjs`. O comando `npm run dev` inicia o desenvolvimento em `http://localhost:3000`.

## Vercel

Importe o repositório na conta autorizada da Vercel, usando o framework TanStack Start e Node.js 24. O arquivo `vercel.json` define instalação e build. Configure as variáveis de `.env.example` nos ambientes apropriados antes de publicar. Em um build Vercel, Nitro gera `.vercel/output`.

Para verificar o formato de build da Vercel localmente, defina `NITRO_PRESET=vercel` no ambiente e execute `npm run build`. Para o preview Node local, use `NITRO_PRESET=node-server`.

Antes de iniciar um servidor conectado aos serviços de produção, confira o projeto vinculado e as variáveis necessárias ao fluxo. Os comandos de deploy, configuração do Supabase e retirada da hospedagem anterior estão detalhados no plano de migração em `docs/superpowers/plans/2026-10-12-vercel-supabase.md`.

Nunca publique `.env`, `.env.local`, `.vercel` ou credenciais. Preserve o projeto Supabase existente e ajuste seus endereços permitidos de autenticação ao domínio verificado.

Antes de enviar o código, execute `vercel deploy --dry --json` e grave o resultado em um arquivo local ignorado. Valide esse arquivo com `node scripts/check-deploy-inputs.mjs CAMINHO-DO-JSON`. O `.vercelignore` exclui arquivos de ambiente, credenciais locais e materiais de execução do upload, além da proteção do Git.

## Mapas gratuitos e navegação

Os mapas internos usam Leaflet e OpenStreetMap, sem chave Google ou cobrança por API. Exibem ruas, lojas, entregadores e localização com as coordenadas salvas. Os créditos OpenStreetMap permanecem visíveis. Os servidores públicos têm capacidade limitada: use apenas os tiles da área aberta, respeite o cache do navegador e não implemente download em massa ou modo offline. [Política de uso](https://operations.osmfoundation.org/policies/tiles/).

Os botões GPS coleta/GPS entrega abrem Google Maps para navegação externa; esses links não precisam de chave de API. As distâncias no app são estimativas em linha reta. Sem coordenadas da entrega, o app preserva o endereço e abre o GPS, sem gerar um marcador ou uma distância fictícios. Não há geocodificação automática de endereços privados pelo servidor público Nominatim.

`VITE_MAP_TILE_URL` e `VITE_MAP_ATTRIBUTION` permitem trocar o provedor de tiles e seus créditos. A seleção manual de cidade funciona sem Google. O geocoding de endereços/cidade já existente permanece opcional com `GOOGLE_MAPS_API_KEY`, para configurar depois; os mapas não dependem dele.

## IA administrativa

O painel administrativo usa o Vercel AI Gateway com `google/gemini-3-flash`; `AI_GATEWAY_MODEL` permite selecionar outro modelo disponível. Na Vercel, a autenticação obtém o token OIDC da requisição usando `@vercel/oidc`, sem guardar um token de build no servidor. Para execução local, use o token obtido por `vercel env pull` ou configure `AI_GATEWAY_API_KEY` somente no ambiente de servidor. Habilite o Gateway no time responsável pelo projeto e confira seu saldo e limites. A conta pode precisar cadastrar um cartão para liberar os créditos gratuitos; faça essa configuração diretamente no painel.

A função mantém a autorização de administrador e envia as métricas agregadas já usadas pelo painel. Erros do provedor geram uma mensagem controlada, sem expor credenciais.

## Domínio, autenticação e push

Configure `VITE_APP_URL` e `APP_URL` com a mesma origem pública em cada ambiente. Sem uma origem explícita, o build usa `VERCEL_URL` com HTTPS; localmente usa `http://localhost:3000`. Canonical, Open Graph, JSON-LD, sitemap e robots compartilham essa origem. Os retornos de cadastro e recuperação de senha usam o domínio aberto pelo usuário, que precisa estar permitido no Supabase Auth.

O painel **Admin → Configurações → Integrações · Brevo** permite salvar a chave API e o remetente, mantendo a chave criptografada no Vault e oculta após salvar. O botão de teste usa somente o e-mail confirmado do administrador. A migration já está aplicada e verificada no Supabase próprio `wifome`. O envio automático de cadastro/recuperação está preparado por Auth Hook assinado; exige ativação operacional única, além da chave/remetente reais testados. Consulte a [configuração Brevo e o estado da ativação](docs/free-email-setup.md). Não coloque a chave em variáveis públicas ou commits.

No projeto Supabase existente, ajuste Site URL e Redirect URLs somente depois de confirmar o domínio de destino. Verifique o trigger de notificações aplicado e atualize o segredo Vault `push_dispatch_base_url` para a origem de produção. O trigger seguro chama `/api/internal/push-dispatch` com o segredo `push_dispatch_secret`, que deve corresponder a `PUSH_DISPATCH_SECRET` da Vercel. Para destinos com inscrições existentes, preserve o par VAPID. No novo projeto vazio, foi configurado um par próprio. Configure `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor. Não reaplique todo o histórico de migrations.

Permissões de notificações e inscrições Web Push pertencem a cada origem. Após mudar de domínio, os usuários precisam permitir notificações e se inscrever no novo endereço. Os IDs dos aplicativos e os nomes de armazenamento permanecem preservados.

## Operação e recuperação

O projeto autorizado é `wsnewdesignercontato-6856/wifomedelivery`, ID `prj_W25oUTDeJ8ygGbngzNBtB8JAxIYZ`. O banco de destino é o projeto próprio `wifome`, ref `nsvgfagjezdduatmbsqq`. O usuário autorizou começar vazio e recriar os três cadastros de teste; o banco anterior não foi alterado. A inicialização verificada está documentada em `supabase/bootstrap/README.md`. Confira a conta com `vercel whoami` antes de vincular ou publicar:

```sh
vercel link --yes --scope wsnewdesignercontato-6856 --project wifomedelivery
vercel env pull .env.local --yes
npm run test
npm run typecheck
npm run build
vercel deploy
```

Use o preview para confirmar `/`, `/auth`, `/sitemap.xml`, `/robots.txt`, os manifests e as imagens:

```sh
node scripts/smoke-migration.mjs https://SEU-PREVIEW.vercel.app
```

Em previews protegidos, use as credenciais temporárias do projeto vinculado, preservando a proteção:

```sh
node --env-file=.env.local scripts/smoke-migration.mjs https://SEU-PREVIEW.vercel.app --vercel
```

Depois de verificar login, mapas gratuitos e os fluxos ativos no destino, publique/promova a produção e atualize os callbacks Supabase para o domínio de produção confirmado. Confira a origem de produção, configure `APP_URL` e `VITE_APP_URL` nesse ambiente e faça novo build quando alterar essas variáveis. Preserve a publicação anterior até confirmar os fluxos e recuperar acesso a todos os serviços.

`npm run preview -- --port 3000` executa o build Node local e lê `.env` e `.env.local`. Para reverificar o output Vercel, defina `NITRO_PRESET=vercel` e execute o build. Confira `.vercel/output/config.json` e a função SSR. A instalação usa apenas o registro público npm e os assets de marca pertencem ao repositório.

Em caso de regressão, restaure um deployment verificado pela Vercel ou reverta os commits por novos commits Git. Preserve o histórico publicado. Mantenha o banco e as credenciais existentes; não aplique migrations em massa nem recrie usuários. Ao encerrar a migração, desconecte a edição/sincronização no painel Lovable e retire a publicação antiga após a validação de produção.

O lint do repositório já tinha erros de formatação e usos de `any` antes da migração. Registre seu resultado separadamente dos testes e do build; revise os arquivos alterados sem reformatação geral do produto.

O lockfile resolve TanStack Start 1.168.60 e seu `start-server-core` 1.169.39, corrigidos para [CVE-2026-102989](https://github.com/TanStack/router/security/advisories/GHSA-qx66-fv34-fjm8). A suíte verifica as versões efetivamente instaladas. Atualizações devem preservar essas correções e manter o Router alinhado à versão usada pelo Start.
