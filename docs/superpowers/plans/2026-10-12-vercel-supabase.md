# Migração Vercel e Supabase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Executar o PedeTrem na Vercel e no Supabase atual, sem dependências operacionais da Lovable.

**Architecture:** Preservar TanStack Start e suas funções de servidor, usando Nitro para o output Vercel. Manter o banco, Auth, Storage e realtime no projeto Supabase existente. Substituir os gateways de mapas e IA, copiar os assets para o repositório e validar o destino antes da retirada da hospedagem anterior.

**Tech Stack:** React 19, TanStack Start/Router, Vite 8, Tailwind 4, Nitro 3, Supabase JS, Node.js 24, Bun 1.4.3 como ferramenta de instalação do lockfile existente, Google Maps e Vercel AI Gateway.

**Spec:** `docs/superpowers/specs/2026-10-12-vercel-supabase-design.md` — aprovada pelo usuário em 12 de outubro de 2026.

## Global Constraints

- Banco referenciado pelo código: `qoafjtzfxogopevbqhll`, em `https://qoafjtzfxogopevbqhll.supabase.co`.
- Branch: `codex/migrate-vercel-supabase`.
- Não recriar tabelas, reaplicar todo o histórico de migrations nem copiar usuários para outro banco.
- Não solicitar chaves secretas pelo chat, imprimir valores no terminal, gravá-los em documentação ou commitar credenciais.
- Manter os IDs dos manifests, nomes de storage, chaves de sessão e rotas existentes.
- Usar Node.js 24 e preservar as versões de produto existentes, exceto quando uma incompatibilidade comprovada exigir ajuste pontual.
- A versão ativa não deve depender de assets, scripts ou serviços hospedados pela Lovable.
- A recuperação não envolve force push, rebase ou alteração de commits publicados.
- Destino Vercel atualizado pelo usuário durante a execução: conta `wsnewdesignercontato@gmail.com`, slug `wsnewdesignercontato-6856`, time `team_Yn1cspiVDGVrd05ytRtmyMze`; projeto `wifomedelivery` (`prj_W25oUTDeJ8ygGbngzNBtB8JAxIYZ`). Essa escolha substitui o destino Nobre inicialmente aprovado.
- Executar alterações administrativas no Supabase somente após confirmar acesso ao projeto correto. A conexão atual retornou erro de permissão.

## Review Focus

- Chave administrativa acidentalmente configurada como chave pública: rejeitar antes do build e impedir sua inclusão no JavaScript do navegador.
- Servidor renderizando sem APIs do navegador: o cliente Supabase não acessa `window` ou `localStorage` durante SSR.
- API Google ou IA retornando erro, timeout ou JSON inesperado: responder de forma controlada, sem revelar credenciais.
- Preview Vercel com URL diferente de produção: metadata e retornos de autenticação apontam à origem configurada e permitida.
- Novo domínio com permissões e assinaturas push antigas: explicar e verificar a reinscrição no destino; preservar IDs e chaves VAPID disponíveis.

---

### Task 1: Build independente e configuração de ambiente

**Files:** modificar `vite.config.ts`, `package.json`, `bun.lock`, `bunfig.toml`, `.gitignore`, `scripts/preview.mjs`; criar `.env.example`, `vercel.json`, `README.md`, `src/lib/supabase-config.ts`, `tests/supabase-config.test.mjs`; retirar `.env` do índice e preservar sua cópia local ignorada.

**Interfaces:** `getPublicSupabaseConfig(input: { url?: string; key?: string }): { url: string; key: string }` valida configuração pública e rejeita `sb_secret_` e JWT com papel `service_role`. O build aceita somente chaves públicas válidas. Scripts `test`, `typecheck`, `build` e `preview` documentam o fluxo reproduzível.

- [ ] Confirmar a identidade do Vercel CLI, a disponibilidade do time autorizado e a criação/link do projeto com os conectores oficiais ou CLI. Usar `--help` para flags não verificadas. Não iniciar servidor antes do link e da verificação das variáveis exigidas para aquele fluxo.
- [ ] Instalar o lockfile existente com Bun 1.4.3, obtido do registro oficial, e registrar o resultado inicial de build, lint e `tsc --noEmit` antes das mudanças de produto. Falhas preexistentes ficam registradas; investigar as que impedirem a migração.
- [ ] Criar `tests/supabase-config.test.mjs`, usando `node:test` e `node:assert/strict`, antes do helper. Assertivas: chave `sb_publishable_` aceita; JWT de papel `anon` aceita; `sb_secret_` e JWT de papel `service_role` rejeitados; URL/chave ausentes rejeitadas sem expor valores.
- [ ] Executar `node --test tests/supabase-config.test.mjs`: a primeira execução deve falhar pela ausência do helper. Implementar o helper TypeScript sem imports de aliases e repetir até passar.
- [ ] Trocar o wrapper Lovable pelos plugins oficiais, preservar `server: { entry: "server" }`, validar a chave pública no carregamento da configuração e disponibilizar variáveis privadas apenas no ambiente do processo de servidor. Configurar Nitro para Vercel e para preview Node local conforme as APIs da versão instalada.
- [ ] Remover dependências e exceções de instalação da Lovable, atualizar apenas o lockfile necessário, criar template/env ignore/configuração Vercel e documentar instalação com Bun e execução dos scripts. Usar `npm run` para scripts ou Bun equivalente, sem resolver novamente todas as dependências com outro gerenciador.
- [ ] Executar testes, build local Node e build com preset Vercel. Verificar `.vercel/output/config.json` e a presença da função SSR e dos assets. Confirmar que `.env` não aparece em `git ls-files` nem no staging.
- [ ] Commit: `build: replace Lovable toolchain with standalone Vercel build`.

### Task 2: Assets locais, sessões e telemetria

**Files:** modificar `src/assets/*.asset.json`, `src/components/ifome-logo.tsx` somente se necessário, `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`, `src/routes/__root.tsx`, `src/styles.css`, `AGENTS.md`; criar `public/assets/*`, `scripts/check-migration-assets.mjs`, `src/lib/error-reporting.ts`; remover `src/integrations/supabase/previewAuthStorage.ts`, `src/lib/lovable-error-reporting.ts` e os metadados ativos `.lovable` que não sejam necessários.

**Interfaces:** `reportRuntimeError(error: unknown, context?: Record<string, unknown>): void` registra falhas sem vínculo com o editor. Os ponteiros de assets mantêm o campo `url`, agora apontando a `/assets/<nome original>`. O cliente Supabase usa o helper público da Task 1 e armazenamento local somente quando `typeof window !== "undefined"`.

- [ ] Criar o verificador de assets que percorre os ponteiros, confirma existência do binário público e valida assinatura PNG/JPEG. Executar antes da cópia e confirmar falha para os ponteiros exclusivos da Lovable.
- [ ] Baixar os oito binários a partir de `https://wifomedelivery.lovable.app` mais a URL já registrada de cada ponteiro. Gravar apenas em `public/assets/`; verificar tipo, tamanho e assinatura. Atualizar os ponteiros e executar o verificador até passar.
- [ ] Remover o broker de sessões do editor, reutilizar a validação de chave pública, preservar o cliente administrativo lazy no servidor e os controles de autenticação. Substituir mensagens de configuração vinculadas à Lovable.
- [ ] Substituir a telemetria de editor por registro independente e atualizar `AGENTS.md` para a hospedagem de destino, preservando as regras de identidade visual e de histórico Git.
- [ ] Executar testes e build; inspecionar HTML SSR e console no preview para comprovar ausência de acesso a APIs de navegador no servidor. Verificar o logo original nos quatro perfis e no layout de erro.
- [ ] Commit: `refactor: remove Lovable assets and editor runtime dependencies`.

### Task 3: Mapas usando credenciais próprias

**Files:** criar `src/lib/geocoding.server.ts`, `src/lib/location.functions.ts`, `tests/geocoding.test.mjs`; modificar `src/lib/google-maps-loader.ts`, `src/components/admin/live-map.tsx`, `src/lib/admin-map.functions.ts`, `src/hooks/use-city-detection.ts`, `.env.example`, `README.md`.

**Interfaces:** `geocodeAddress(address: string, options?: { apiKey?: string; fetch?: typeof fetch }): Promise<{ lat: number; lng: number } | null>` e `reverseGeocodeCoordinates(lat: number, lng: number, options?: { apiKey?: string; fetch?: typeof fetch }): Promise<{ cidade: string; estado: string } | null>` vivem no módulo de servidor. `reverseGeocodeCity` é uma função TanStack autenticada, com input `{ lat: number; lng: number }`, chamada pelo hook. A chave de navegador é `VITE_GOOGLE_MAPS_API_KEY`.

- [ ] Escrever primeiro testes com `node:test`: coordenadas Google válidas; cidade por `administrative_area_level_2` ou `locality`; chave ausente; coordenadas inválidas; HTTP 429/500; JSON inválido; timeout. Assertivas incluem retorno `null` nas falhas e ausência de credenciais em mensagens de erro.
- [ ] Executar `node --test tests/geocoding.test.mjs` e confirmar a falha inicial. Implementar helpers com validação de latitude/longitude, URL Google direta e limite de tempo de requisição; repetir até passar.
- [ ] Criar `reverseGeocodeCity` com o middleware de autenticação existente, validar input antes de chamar Google e conectar o hook preservando a flag de detecção por sessão. A falha de geocoding não pode impedir o uso do app.
- [ ] Trocar as variáveis do loader e do mapa administrativo e a chamada de geocoding do administrador. Manter sua checagem de papel e suas atualizações autorizadas no banco.
- [ ] Configurar chaves Google com restrições adequadas no canal autorizado. Verificar no preview mapa, detecção de cidade, geocoding administrativo e rejeição de chamadas sem sessão.
- [ ] Commit: `feat: connect maps directly to Google APIs`.

### Task 4: IA administrativa independente

**Files:** criar `src/lib/ai-gateway.server.ts`, `tests/ai-gateway.test.mjs`; modificar `src/lib/admin-ai.functions.ts`, `.env.example`, `README.md`.

**Interfaces:** `generateOperationsInsight(question: string, summary: Record<string, unknown>, options?: { token?: string; model?: string; fetch?: typeof fetch }): Promise<string>` chama `https://ai-gateway.vercel.sh/v1/chat/completions`. Modelo padrão `google/gemini-3-flash`, confirmado no catálogo público; override `AI_GATEWAY_MODEL`. Token de servidor obtido de `AI_GATEWAY_API_KEY` ou OIDC Vercel oficialmente suportado.

- [ ] Escrever testes antes do helper: resposta válida em português; token ausente; HTTP 401 e 429; JSON inválido; conteúdo vazio; timeout. Verificar que erros não contêm token e que a requisição usa o modelo configurado e o endpoint Vercel.
- [ ] Executar `node --test tests/ai-gateway.test.mjs` e confirmar falha inicial. Implementar o helper com timeout e tratamento dos erros; executar até passar.
- [ ] Conectar o helper ao handler existente, mantendo o middleware, a checagem `has_role` de administrador e a agregação de métricas. Remover `LOVABLE_API_KEY` e o endpoint Lovable.
- [ ] Configurar autenticação do Gateway no destino, executar uma consulta administrativa de teste autorizada e confirmar rejeição de perfil sem autorização. Não enviar dados de clientes que não sejam necessários às métricas existentes.
- [ ] Commit: `feat: migrate admin insights to Vercel AI Gateway`.

### Task 5: Origem pública e notificações no destino

**Files:** criar `src/lib/app-url.ts`, `src/lib/app-config.ts`, `tests/app-url.test.mjs`; modificar `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/auth.tsx`, `src/routes/sitemap[.]xml.ts`, `public/robots.txt` ou substituir por rota dinâmica `src/routes/robots[.]txt.ts`, `.env.example`, `README.md`; modificar SQL somente se o trigger aplicado exigir correção comprovada.

**Interfaces:** `resolveAppUrl(config: { appUrl?: string; vercelUrl?: string }): string` retorna origem HTTP(S) normalizada. Preferência: URL explícita, URL Vercel com HTTPS, `http://localhost:3000` no ambiente local. URL explicitamente inválida gera erro de configuração. `APP_URL` em `app-config.ts` conecta as variáveis do cliente/servidor ao helper sem expor segredos.

- [ ] Escrever primeiro testes: URL explícita com barra final; hostname Vercel; fallback local; protocolo inválido rejeitado. Executar `node --test tests/app-url.test.mjs`, confirmar falha inicial e implementar o helper até passar.
- [ ] Aplicar a origem centralizada a canonical, Open Graph, JSON-LD, sitemap e robots. Manter IDs dos manifests e storage e remover os domínios antigos das respostas públicas.
- [ ] Com acesso confirmado ao Supabase correto, consultar apenas configurações relevantes, versões de migrations e o trigger de push ativo. Atualizar `Site URL`, allowlist de retorno e `push_dispatch_base_url` para as URLs autorizadas; alinhar segredo de dispatch e VAPID no servidor sem imprimir valores. Não alterar tabelas comerciais.
- [ ] Verificar login/recuperação de senha no endereço novo e callback real do banco ao dispatch. Testar resposta 401 para segredo incorreto e entrega em inscrição push de teste no domínio novo.
- [ ] Commit: `feat: move public URLs and notification callbacks to Vercel`.

### Task 6: Preview, verificação completa e retirada da Lovable

**Files:** criar `scripts/smoke-migration.mjs`; completar `README.md` com procedimento de deploy, operação, variáveis, limites e recuperação. Alterações externas: projeto/env/deploy Vercel, URLs e segredo no Supabase, desconexão da integração Lovable quando a nova produção estiver validada.

**Interfaces:** `node scripts/smoke-migration.mjs <base-url>` faz verificações HTTP somente de leitura e encerra com código diferente de zero quando detectar falha. Verifica `/`, `/auth`, `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest` e as oito imagens referenciadas; confirma status, tipos de conteúdo e ausência dos endpoints/domínios antigos.

- [ ] Executar a suíte completa com `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build` e build Nitro para Vercel. Relatar separadamente problemas preexistentes que ainda estejam presentes, sem afirmar que passaram.
- [ ] Verificar diff e staging, lockfile, origens públicas e bundle do cliente. Procurar credenciais de servidor por nomes e por valores lidos em memória, imprimindo somente o nome do problema caso haja vazamento.
- [x] Publicar preview na conta autorizada e executar o smoke HTTP. Usar o caminho oficial de acesso autenticado se o preview estiver protegido, sem desativar proteção por conveniência.
- [ ] Verificar pelo navegador página inicial, assets, login e os perfis disponíveis com sessão autorizada. Para checkout e notificações, usar somente dados de teste que o usuário tenha autorizado; registrar o que não puder ser verificado por falta de sessão/credencial.
- [x] Executar revisão completa da mudança conforme o método escolhido pelo usuário e corrigir problemas encontrados. Repetir testes afetados por correções.
- [x] Promover/publicar a produção validada. Autorização explícita do usuário em 15/10 para publicar mantendo Brevo para configuração posterior. Build de produção `0030238`, deployment `dpl_uVi8mH7MJ3ffp15QP3WXN4YbvJuR`, testado e promovido a `https://wifomedelivery.vercel.app`; 13 endpoints e acesso servidor/Supabase passaram. Domínio padrão preservado.
- [x] Atender à troca de endereço solicitada para PedeTrem: `https://pedetrem.vercel.app`, domínio verificado no mesmo projeto e conta, variáveis públicas de origem atualizadas, novo build `6b1eb9c` testado em 13 endpoints e promovido (`dpl_BHixB7Gexwq4QfZUQyqLYeYbmhx3`). Alias anterior mantido para compatibilidade.
- [x] Atualizar retornos Auth e URL de dispatch no Vault para a nova origem. PATCH limitado a Site URL e Redirect URLs, com todos os demais campos Auth preservados; allowlist anterior mantida. Vault atualizado por SQL com guardas e resultado confirmado. Perfil YAML do CLI autenticado e verificado sem novo código.
- [ ] Concluir confirmação/recuperação por e-mail, operação dos quatro perfis, pedido completo e push em dispositivo no domínio final. IA e geocoding opcional adiados pelo usuário; mapa gratuito já verificado. Publicação não representa aprovação desses fluxos ainda pendentes.
- [ ] Desconectar a edição/sincronização Lovable e retirar a publicação antiga somente quando os fluxos do destino estiverem verificados e houver acesso aos controles correspondentes. Preservar os dados e histórico; quando um controle não estiver acessível, registrar a ação exata restante e o motivo.
- [ ] Entregar URL de produção, branch/commits, resultados dos testes e qualquer pendência comprovada. Commit final da documentação: `docs: document independent Vercel and Supabase operation`.

## Método recomendado

Execução nativa: o agente principal implementa as tarefas nesta sessão e realiza uma revisão final independente antes da publicação. As tarefas compartilham configuração, autenticação e URLs, por isso a execução sequencial reduz conflito e repetição. A alternativa é execução por agentes com revisão a cada tarefa, escolhida explicitamente pelo usuário.

### Extensão da Task 6: destino vazio confirmado

Decisão do usuário: os três cadastros são descartáveis; iniciar no Supabase próprio `wifome/nsvgfagjezdduatmbsqq`. O histórico original de 79 migrations permanece intacto.

- [x] Reconstruir e verificar localmente o schema, removendo apenas a concessão ao UUID de teste antigo e corrigindo uma conversão de enum na cópia local.
- [x] Testar restauração com permissões padrão equivalentes às do destino; restaurar ACLs de funções/tabelas/colunas sem alterar defaults do provedor.
- [x] Aplicar initializer transacional com bloqueio de destino não vazio; verificar 51 tabelas, 637 colunas, 47 funções do app, RLS, Auth, quatro buckets privados e 17 tabelas realtime.
- [x] Corrigir acesso ao log administrativo e restringir RPC legado de cidade por ID arbitrário, preservando a chamada autenticada usada pelo app.
- [x] Configurar na Vercel a conexão pública do novo projeto e segredos apenas no servidor. Configurar par VAPID novo, sem tocar no sistema antigo.
- [x] Ajustar somente Site URL/Redirect URLs do Auth; preservar confirmação de e-mail, MFA, frequência e tamanho de OTP.
- [x] Registrar histórico correspondente ao snapshot para impedir reaplicação das migrations antigas.
- [x] Validar novo preview e Vault/dispatch: `47f73f2`, 13 endpoints e RPC/dispatch autorizado/rejeitado passaram. Login de teste e mapa no navegador local passaram; fixtures temporárias removidas após saída global.
- [x] Aplicar a migration da integração Brevo no Supabase remoto após renovar a sessão CLI. Dry-run confirmou somente a migration nova; versão `20261014215702` aplicada e registrada, total 81. Testes SQL remotos passaram com rollback das fixtures. Tela admin e backend foram implementados, com Vault privado, teste para o próprio admin e Auth Hook assinado preparado; validação local concluída. O usuário aprovou inserir a chave API no admin, substituindo SMTP.
- [ ] Configurar conta/remetente e chave real Brevo pelo admin, ativar o hook e verificar entrega de cadastro/recuperação no domínio final; guia em `docs/free-email-setup.md`.
- [ ] Validar fluxos restantes antes da retirada da Lovable. Produção publicada por autorização posterior do usuário, com configuração real de e-mail ainda pendente. Credenciais Google Maps e IA foram adiadas por decisão do usuário; não bloqueiam o mapa gratuito aprovado abaixo.

Procedimento e limites do initializer: `supabase/bootstrap/README.md`.

### Ajuste aprovado: mapa gratuito

O usuário escolheu OpenStreetMap dentro do app e navegação externa gratuita. Alteração limitada aos mapas existentes: Leaflet com tiles OSM e créditos visíveis, marcadores/coordenadas salvas e botões Google Maps URLs sem API. Remover o SDK Google do navegador. Preservar cálculo de distância aproximada e regras de aceite; endereço sem coordenadas continua disponível para GPS externo, sem coordenadas inventadas. A geocodificação opcional e a IA podem ser configuradas depois. Verificar SSR, mapa/markers, links, ausência de chamadas ao SDK Google, testes, tipos, build e preview.
