# PedeTrem / wifomedelivery

Aplicação React e TanStack Start com SSR e funções de servidor. A Vercel hospeda o aplicativo; o Supabase mantém banco, autenticação, arquivos e realtime.

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

## Google Maps

Use credenciais de um projeto Google Cloud que você administra, com Maps JavaScript API e Geocoding API habilitadas. Configure `VITE_GOOGLE_MAPS_API_KEY` para o mapa no navegador, restringindo essa chave aos domínios do aplicativo. Configure `GOOGLE_MAPS_API_KEY` separadamente no servidor para geocoding. A chave de servidor não é enviada ao navegador.

A detecção de cidade passa por uma função autenticada do aplicativo. Falhas do provedor deixam a localização automática indisponível e permitem continuar usando a cidade selecionada.

## IA administrativa

O painel administrativo usa o Vercel AI Gateway com `google/gemini-3-flash`; `AI_GATEWAY_MODEL` permite selecionar outro modelo disponível. Na Vercel, a autenticação usa o token OIDC do deployment. Para execução local, configure `AI_GATEWAY_API_KEY` somente no ambiente de servidor. Habilite o Gateway no time responsável pelo projeto e confira seu saldo e limites.

A função mantém a autorização de administrador e envia as métricas agregadas já usadas pelo painel. Erros do provedor geram uma mensagem controlada, sem expor credenciais.

## Domínio, autenticação e push

Configure `VITE_APP_URL` e `APP_URL` com a mesma origem pública em cada ambiente. Sem uma origem explícita, o build usa `VERCEL_URL` com HTTPS; localmente usa `http://localhost:3000`. Canonical, Open Graph, JSON-LD, sitemap e robots compartilham essa origem. Os retornos de cadastro e recuperação de senha usam o domínio aberto pelo usuário, que precisa estar permitido no Supabase Auth.

No projeto Supabase existente, ajuste Site URL e Redirect URLs somente depois de confirmar o domínio de destino. Verifique o trigger de notificações aplicado e atualize o segredo Vault `push_dispatch_base_url` para a origem de produção. O trigger seguro chama `/api/internal/push-dispatch` com o segredo `push_dispatch_secret`, que deve corresponder a `PUSH_DISPATCH_SECRET` da Vercel. Preserve o par VAPID e configure `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor. Não reaplique todo o histórico de migrations.

Permissões de notificações e inscrições Web Push pertencem a cada origem. Após mudar de domínio, os usuários precisam permitir notificações e se inscrever no novo endereço. Os IDs dos aplicativos e os nomes de armazenamento permanecem preservados.
