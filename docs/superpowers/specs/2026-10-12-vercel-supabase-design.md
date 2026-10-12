# Migração do PedeTrem / wifomedelivery para Vercel e Supabase

## Objetivo e decisões aprovadas

O usuário quer retirar totalmente o aplicativo da Lovable, hospedar o aplicativo na Vercel e manter o banco no Supabase de sua própria conta. Em 12 de outubro de 2026, aprovou manter TanStack Start, executar páginas e funções de servidor na Vercel, acessar Google Maps diretamente e substituir a IA da Lovable pelo Vercel AI Gateway.

O resultado deve manter os fluxos existentes de cliente, estabelecimento, entregador e administrador, incluindo login, pedidos, mapas, realtime, arquivos e notificações. A migração não inclui redesenho visual nem mudança das regras comerciais.

## Base inspecionada

- Repositório: `https://github.com/wsnewdesignercontato-crypto/wifomedelivery`.
- Base de trabalho: `origin/main`, commit `b03aa1be69e1cbf9e0985f917f3ae6124970c267`.
- Pasta isolada: `C:/Users/Micro/Desktop/profitslim-projeto/wifomedelivery.worktrees/vercel-supabase`.
- Branch: `codex/migrate-vercel-supabase`.
- A cópia original em `wifomedelivery` contém alterações locais em `src/routeTree.gen.ts` e um arquivo `.codex-dev.err`. Esses arquivos permanecem na cópia original.
- Stack existente: React 19, TanStack Start, TanStack Router, Vite 8, Tailwind 4, Nitro 3 e Supabase JS.
- Banco referenciado pelo código: `qoafjtzfxogopevbqhll`, em `https://qoafjtzfxogopevbqhll.supabase.co`.
- A API pública de configuração do Supabase Auth respondeu HTTP 200. Isso confirma disponibilidade da API; não comprova acesso administrativo nem funcionamento de todos os fluxos.
- Existem 79 arquivos de migração no repositório. O estado aplicado no banco precisa ser consultado com acesso administrativo.
- Não existe script de testes em `package.json`. Existem scripts de build e lint.

## Arquitetura de destino

O navegador obtém páginas e arquivos estáticos da Vercel. TanStack Start e Nitro executam SSR, funções de servidor e a rota de envio de notificações na Vercel.

Supabase continua responsável por PostgreSQL, autenticação, políticas RLS, arquivos e realtime. As consultas de usuários usam a chave publicável e sua sessão. Operações administrativas continuam dentro de handlers de servidor autenticados, com chave administrativa disponível exclusivamente no servidor.

Google Maps passa a usar credenciais próprias, sem o gateway de conectores da Lovable. A IA administrativa usa o Vercel AI Gateway a partir do servidor e mantém a checagem de perfil administrador antes de consultar métricas ou gerar respostas.

O GitHub permanece como fonte do código. Deploys da Vercel devem partir deste repositório. A integração de edição e publicação da Lovable deve ser desconectada após validar o destino, sem reescrever histórico Git.

## Build independente

Substituir `@lovable.dev/vite-tanstack-config` em `vite.config.ts` pelos plugins oficiais de TanStack Start, React, Tailwind, aliases e Nitro, seguindo a ordem compatível com as versões instaladas.

Preservar o entrypoint `src/server.ts` e seu tratamento de erros SSR. O build para Vercel deve produzir o formato esperado pelo adaptador Nitro; o build de preview local deve manter um entrypoint Node executável ou ter seu script ajustado ao output efetivamente produzido.

Remover as dependências transitivas específicas da Lovable que deixarem de ser necessárias. Remover as exceções específicas da Lovable em `bunfig.toml`, atualizar o lockfile e documentar um único fluxo reproduzível de instalação e build. Usar Node.js 24 e preservar as versões de produto existentes, exceto quando uma incompatibilidade comprovada exigir ajuste pontual.

Criar configuração de deploy na Vercel e documentação de desenvolvimento. Retirar `.env` do controle de versão e fornecer `.env.example` com nomes e valores de exemplo. Os valores reais ficam em arquivos locais ignorados e nas variáveis da Vercel.

## Imagens e identidade visual

Oito imagens são referenciadas por arquivos `src/assets/*.asset.json` com URLs `/__l5e/assets-v1/...`. As oito URLs responderam HTTP 200 no domínio publicado da Lovable.

Copiar os binários para `public/assets/` e atualizar os ponteiros para essas URLs locais. Verificar tipo de conteúdo, tamanho e resposta HTTP no destino. Preservar os nomes públicos dos assets, o componente de logo compartilhado, o desenho aprovado, os favicons e os ícones de instalação.

Os arquivos históricos de planejamento podem continuar no histórico Git. A versão ativa não deve depender de assets, scripts ou serviços hospedados pela Lovable. Atualizar as instruções atuais de `AGENTS.md` para refletir a nova hospedagem e preservar as regras de identidade visual.

## Supabase e sessões

Remover o broker de sessões do editor Lovable em `src/integrations/supabase/previewAuthStorage.ts`. O cliente no navegador usa armazenamento local normal e preserva a persistência de sessão; o caminho SSR não acessa `window` ou `localStorage`.

Revisar `client.ts`, `client.server.ts` e `auth-middleware.ts` para configurar variáveis de ambiente fora da Lovable, manter a autenticação dos handlers e impedir que chaves administrativas entrem no bundle do navegador. A chave publicável não pode aceitar uma chave secreta como substituta.

Manter o projeto Supabase atual. Não recriar tabelas, reaplicar todo o histórico de migrations nem copiar usuários para outro banco. Ajustar `Site URL`, URLs permitidas de retorno e configurações de integração para o endereço definitivo e os previews autorizados da Vercel. Confirmar login e recuperação de senha no novo endereço.

## Mapas e IA

Em `src/lib/google-maps-loader.ts` e `src/components/admin/live-map.tsx`, substituir as variáveis de connector Lovable por `VITE_GOOGLE_MAPS_API_KEY`. Essa chave de navegador deve ter restrição de origem e de APIs adequadas.

Em `src/lib/admin-map.functions.ts`, acessar a API Google Geocoding diretamente pelo servidor, com `GOOGLE_MAPS_API_KEY`, mantendo a autorização de administrador.

Em `src/hooks/use-city-detection.ts`, remover o gateway Lovable e usar o geocoding do Google em um handler do servidor, preservando a detecção por geolocalização e o comportamento de falha já esperado pela tela. A chave de servidor não é enviada ao navegador. Evitar introduzir novas chamadas a serviços públicos sem limites ou políticas de uso verificadas.

Em `src/lib/admin-ai.functions.ts`, substituir `LOVABLE_API_KEY` e `ai.gateway.lovable.dev` pelo Vercel AI Gateway. O catálogo consultado em 12 de outubro de 2026 contém `google/gemini-3-flash`, que será o modelo padrão correspondente à variante preview usada no código atual. Permitir configuração por `AI_GATEWAY_MODEL`. Usar a API compatível de chat com autenticação por `AI_GATEWAY_API_KEY` ou identidade OIDC da Vercel. Tratar indisponibilidade, credenciais ausentes e respostas inválidas sem expor segredos.

## URLs públicas, observabilidade e notificações

Centralizar a origem pública em `VITE_APP_URL` e `APP_URL`, com fallback para o endereço do deployment Vercel quando apropriado. Remover os domínios Lovable de canonical, Open Graph, dados estruturados, sitemap e robots.

Substituir `src/lib/lovable-error-reporting.ts` por registro de erros independente, mantendo as telas de erro e os logs do servidor. Remover estilos e metadados exclusivos do editor.

Manter os IDs dos manifests, nomes de storage, chaves de sessão e rotas existentes. Uma mudança de domínio cria uma origem diferente no navegador; não prometer transferência automática de sessões, permissões ou inscrições push entre origens.

A rota `/api/internal/push-dispatch` permanece autenticada pelo segredo de dispatch. No Supabase Vault, atualizar `push_dispatch_base_url` para a nova URL e manter o segredo alinhado com `PUSH_DISPATCH_SECRET` na Vercel. Verificar primeiro qual migration e trigger estão ativos. Configurar as mesmas chaves VAPID existentes quando disponíveis; alterações nas chaves exigem reinscrição das assinaturas.

## Variáveis de ambiente

Variáveis de navegador: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_APP_URL`.

Variáveis de servidor: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_MAPS_API_KEY`, `APP_URL`, `PUSH_DISPATCH_SECRET`, `VAPID_PRIVATE_JWK`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`.

Usar a autenticação oficialmente suportada pelo Vercel AI Gateway, preferindo a identidade do deployment quando disponível e uma chave protegida para execução local se necessária. Confirmar as exigências na documentação vigente antes de implementar.

Não solicitar chaves secretas pelo chat, imprimir valores no terminal, gravá-los em documentação ou commitar credenciais. Consultar ou configurar credenciais apenas pelos canais administrativos autorizados.

## Acesso e condições de publicação

A conexão Supabase disponível lista somente o projeto “Nobre Eventos” e retornou erro de permissão para `qoafjtzfxogopevbqhll`. O navegador abriu a página de login do Supabase. Para ajustes administrativos do banco atual, é necessário conectar a conta que tenha acesso a esse projeto ou disponibilizar uma sessão autenticada no painel.

A conexão Vercel está autenticada no time `nobremarcasrm-3813s-projects`, ID `team_HPryP7i6vMXYwzuqmtl3ZiJD`. Não retornou projetos existentes. O usuário confirmou explicitamente esse time como destino da publicação em 12 de outubro de 2026.

O projeto proposto na Vercel se chama `wifomedelivery`. Seu domínio padrão pode servir para a primeira validação. Um domínio próprio só será configurado quando o usuário informar o domínio e houver acesso à administração correspondente.

O trabalho local de código pode avançar após as revisões exigidas do desenho e do plano. A publicação validada depende de acesso ao time Vercel escolhido e às credenciais de servidor, mapas e IA. Ajustes administrativos no Supabase dependem do acesso ao projeto correto.

## Validação e critérios de conclusão

1. Instalação reproduzível e build Vercel terminam com sucesso. Registrar falhas preexistentes de lint e tipos separadamente das introduzidas pela migração.
2. Página inicial, login, páginas autenticadas, sitemap, robots, manifests e todos os assets respondem no preview.
3. Login, persistência de sessão, logout e recuperação de senha usam o Supabase atual e os novos endereços permitidos.
4. Perfis de cliente, estabelecimento, entregador e administrador mantêm sua autorização e seus fluxos principais.
5. Consultas e realtime funcionam no Supabase atual. Validar o fluxo de pedidos com dados de teste explicitamente autorizados, sem gerar cobrança real.
6. Google Maps, detecção de cidade, geocoding administrativo e IA funcionam usando os novos provedores e falham de forma controlada.
7. Dispatch push rejeita solicitações não autorizadas e entrega notificações a uma inscrição de teste autorizada no novo domínio.
8. Bundle do cliente não contém chaves administrativas, chaves privadas VAPID ou credenciais de IA e geocoding do servidor.
9. A versão ativa não chama endpoints Lovable nem busca seus assets. Uma busca textual e a inspeção de rede do preview comprovam a retirada das dependências.
10. Deploy de produção, domínio escolhido e Supabase são verificados antes de desligar a hospedagem e a sincronização Lovable.

Manter o deploy anterior disponível até validar o destino. Se a validação falhar, corrigir o preview; se já houver mudança de endereço, restaurar a configuração de URL anterior. A recuperação não envolve force push, rebase ou alteração de commits publicados.

## Fontes técnicas consultadas

- [TanStack Start na Vercel](https://vercel.com/docs/frameworks/full-stack/tanstack-start).
- [Hospedagem e saída da Lovable](https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership).
- [URLs de retorno do Supabase Auth](https://supabase.com/docs/guides/auth/redirect-urls).
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway).
