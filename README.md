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
