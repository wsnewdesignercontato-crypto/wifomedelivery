# Asaas Transparent Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Preserve the user's choice of execution in this session. Do not begin implementation before the user reviews this written plan.

**Goal:** Receber Pix e cartão de crédito à vista dentro do checkout PedeTrem, com a Asaas processando o pagamento e o pedido sincronizado com loja, entregador e admin.

**Architecture:** Estender o checkout transacional existente com o canal online, mantendo o pedido pendente até confirmação verificada. Persistir tentativas antes de chamar a Asaas, conciliar respostas inconclusivas e processar eventos por um worker autenticado, com bloqueios no banco. Reutilizar o módulo administrativo, o Vault, a rotina de notificações e a conferência manual de repasses.

**Tech Stack:** TanStack Start, React, TypeScript, Nitro/Vercel, Supabase Auth/Postgres/Vault/Cron/pg_net, API Asaas v3, Node test runner e PGlite; sem novo SDK obrigatório.

**Spec:** `docs/superpowers/specs/2026-10-19-asaas-checkout-design.md`, revisada para checkout transparente e aprovada pelo usuário.

## Global Constraints

- Preservar Supabase `nsvgfagjezdduatmbsqq`, o projeto Vercel `wifomedelivery` e os três aplicativos com suas origens e identidades de instalação.
- As credenciais ficam no Vault e são usadas exclusivamente pelo servidor. Não solicitar chaves, senhas ou códigos pelo chat.
- Preservar a conferência manual pelo admin para disponibilizar saldo de saque; confirmação do pagamento online não autoriza automaticamente repasses ou saques.
- A loja paga seu próprio cupom e a plataforma paga o cupom da plataforma.
- Esta entrega cobre Pix e cartão de crédito à vista. Não inclui débito online, parcelamento, boleto, assinatura ou salvar cartão para compras futuras.
- O ambiente é escolhido pelo servidor. A produção pública nunca usa Sandbox.
- A janela operacional para concluir o pagamento é de 10 minutos; isso não deve ser confundido com a validade bancária do QR Code Pix.
- Número completo do cartão, código de segurança e corpo bruto da requisição não podem ser persistidos em tabelas, Vault, storage, logs, auditoria, notificações, analytics, localStorage ou sessionStorage.
- Usar timeout de pelo menos 60 segundos para o processamento de cartão; manter 8 segundos para as consultas administrativas existentes.
- Não repetir automaticamente o POST do cartão após timeout ou resultado inconclusivo.
- Somente confirmação válida pode liberar o pedido para a loja e iniciar os 60 segundos de aceitação.
- A ativação em produção começa desligada. Não criar cobranças reais de teste sem instrução explícita.
- Não reescrever histórico Git publicado nem editar migrations já aplicadas. Usar o CLI para gerar nomes de novas migrations.

## Review Focus

1. A aba é fechada ou a rede cai após o envio do cartão: o worker deve conciliar a mesma tentativa sem reenviar o cartão. Testes nas tarefas 2, 3 e 4.
2. Um evento chega antes da resposta do POST, repetido ou fora de ordem: uma única associação validada e nenhum pedido ou crédito duplicado. Testes nas tarefas 2 e 4.
3. O usuário troca de conta, sai ou abre o pedido de outra pessoa enquanto uma operação termina: negar leitura/alteração cruzada e descartar respostas antigas na UI. Testes nas tarefas 3 e 5.
4. A configuração é alterada, o recurso é desativado ou o webhook fica sem teste durante um pagamento: impedir novas tentativas incompatíveis sem perder a conciliação das existentes. Testes nas tarefas 2, 3 e 6.
5. O estoque é liberado antes de um Pix tardio ou a loja não aceita em 60 segundos: não reativar o pedido; abrir pendência de reembolso sem marcar devolução fictícia. Testes nas tarefas 2, 4 e 6.

## Preflight e mapa de arquivos

Trabalhar somente em `C:/Users/Micro/Desktop/profitslim-projeto/wifomedelivery.worktrees/vercel-supabase`. O cwd padrão `agente-iapro` não é o projeto PedeTrem. Confirmar `git rev-parse --git-dir`, `git rev-parse --git-common-dir`, branch e status; o checkout já é um worktree vinculado. Ler o `AGENTS.md` desse diretório e preservar alterações de outras sessões.

Antes de implementar, buscar `origin/main` e comparar alterações. A base publicada da configuração é `10d1b98fb2b6ed03cb4bbbaa8b6035d4fb341189`; os commits locais posteriores contêm a especificação. Integrar avanços com merge normal, sem rebase/force. Confirmar `.vercel/project.json` com projeto `prj_W25oUTDeJ8ygGbngzNBtB8JAxIYZ`, time `team_Yn1cspiVDGVrd05ytRtmyMze`, conta WS.

Arquivos novos principais:

| Arquivo                                           | Responsabilidade                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `src/lib/asaas-payment-contract.ts`               | Validação, tipos seguros, estados e regras de transição               |
| `src/lib/asaas-payment-api.server.ts`             | Cliente/pagamento/Pix na API Asaas; erros classificados e sanitizados |
| `src/lib/asaas-payment-store.server.ts`           | Adaptador das RPCs privadas de tentativas, leitura e conciliação      |
| `src/lib/asaas-payment-service.server.ts`         | Orquestração idempotente, sem persistir dados do cartão               |
| `src/lib/asaas-payment.functions.ts`              | Fronteira autenticada de operações do cliente e do admin              |
| `src/lib/asaas-payment-worker.server.ts`          | Conciliação de eventos e expiração, independente do navegador         |
| `src/routes/api/internal/asaas-reconcile.ts`      | Endpoint interno POST autenticado do worker                           |
| `src/components/checkout/online-payment-form.tsx` | Titular e cartão apenas em memória; submissão explícita               |
| `src/components/checkout/order-payment-panel.tsx` | Pix, copiar código, estados e retomada do pagamento                   |
| `src/components/order-payment-badge.tsx`          | Informação operacional de pagamento online/na entrega                 |
| `src/components/admin/asaas-payments.tsx`         | Conciliação, reembolsos pendentes e estado financeiro online          |

Os testes novos usam o prefixo `tests/asaas-payment-*.test.mjs` e contratos `supabase/tests/asaas-payments.sql`. As migrations terão o caminho retornado por `supabase migration new asaas_transparent_payments` e, para a agenda do worker, `supabase migration new asaas_payment_reconciliation`; registrar os nomes reais no andamento deste plano ao executar esses passos, sem inventar timestamps.

## Contratos compartilhados

Definir em `asaas-payment-contract.ts`:

- `PaymentMethod = 'pix' | 'cartao'` e `PaymentChannel = 'delivery' | 'asaas' | 'free'`.
- `PaymentState = 'creating' | 'pending' | 'processing' | 'risk_analysis' | 'confirmed' | 'received' | 'declined' | 'uncertain' | 'cancel_pending' | 'cancelled' | 'expired' | 'refund_pending' | 'partially_refunded' | 'refunded' | 'disputed'`.
- `PayerInput { name, cpfCnpj, email, phone, postalCode?, addressNumber? }` e `CardInput { holderName, number, expiryMonth, expiryYear, ccv }`; não retornar esses objetos em DTOs ou erros.
- `PaymentView { orderId, channel, state, totalCents, expiresAt, paidAt, pix: { encodedImage, payload, expirationDate } | null, canRetry, message }`. Não incluir chave, token, corpo bruto, número do cartão, CCV ou dados completos do pagador.
- `PaymentSnapshot { id, customerId, externalReference, billingType, valueCents, status, netValueCents, refundedValueCents }`, validado a partir de consulta servidor à Asaas. `netValueCents` é apenas conciliação; não substitui o total bruto do pedido.

Preservar a assinatura pública de `checkout_order` para pedidos na entrega. Extrair seu cálculo/reserva para `private.checkout_order_core` com o canal explicitamente fornecido pelos wrappers SQL; adicionar `public.checkout_online_order` autenticada com os mesmos parâmetros do checkout atual. Nenhum navegador escolhe ambiente, configuração, cliente Asaas, valor cobrado ou estado financeiro.

RPCs de serviço em `public`, executáveis exclusivamente por `service_role`, com argumentos nomeados:

- `asaas_payment_claim(_user_id uuid, _order_id uuid) -> jsonb`: devolve tentativa persistida, referência externa, lease de 180 segundos e modo `create`, `reuse` ou `reconcile`. Cria nova tentativa somente após recusa definitiva; nunca após incerteza.
- `asaas_payment_attach(_attempt_id uuid, _operation_id uuid, _snapshot jsonb) -> boolean`: associa somente cobrança/cliente/método/total compatíveis, com unicidade por ambiente/cobrança.
- `asaas_payment_apply(_attempt_id uuid, _snapshot jsonb, _source_event_id text DEFAULT NULL) -> jsonb`: transição atômica verificada e DTO seguro; efetua a mudança `pending_payment → placed` quando cabível.
- `asaas_payment_fail(_attempt_id uuid, _operation_id uuid, _kind text) -> boolean`: aceita somente `declined` ou `uncertain`; liberação condicionada à identidade da operação.
- `asaas_payment_view(_user_id uuid, _order_id uuid) -> jsonb`: DTO restrito ao proprietário verificado; dados não sensíveis de pagamento podem ser apresentados por campo próprio aos perfis operacionais autorizados.
- `asaas_customer_claim(_user_id uuid, _environment text) -> jsonb` e `asaas_customer_complete(_user_id uuid, _environment text, _operation_id uuid, _customer_id text) -> boolean`: associação e exclusão mútua de cadastro de cliente por usuário/ambiente.
- `asaas_payment_work_claim(_limit integer) -> jsonb`: até 10 itens, lease por item e `SKIP LOCKED`; engloba eventos, tentativas inconclusivas e cancelamentos vencidos.
- `asaas_payment_work_complete(_work_id uuid, _operation_id uuid, _outcome text) -> boolean`: encerra ou reagenda somente o item sob lease correto; `_outcome` aceita `done`, `retry` ou `review`. Não marca um evento como processado se a aplicação do snapshot falhou.
- `asaas_online_set_enabled(_enabled boolean) -> boolean`: só permite ativar produção com chave testada e revisão atual do webhook registrada.
- `asaas_payments_admin(_before timestamptz DEFAULT NULL, _limit integer DEFAULT 50) -> jsonb`: paginação administrativa, sem PII do cartão.

Implementar os adaptadores TS com validação explícita de DTOs, sem casts de objetos brutos ao navegador. As RPCs não são um substituto da verificação de identidade/admin nos handlers.

### Task 1: Contratos, validação e transporte Asaas

**Files:** criar `src/lib/asaas-payment-contract.ts`, `src/lib/asaas-payment-api.server.ts`, `tests/asaas-payment-api.test.mjs`; modificar `src/lib/asaas-api.server.ts` somente se compartilhar o transporte sem alterar o contrato administrativo.

**Interfaces:** produzir `validatePayer(input)`, `validateCard(input)`, `validatePaymentSnapshot(input)`, `findOrCreateAsaasCustomer(credentials, userReference, payer, options)`, `createAsaasPayment(credentials, attempt, payer, card, remoteIp, options)`, `findAsaasPayments(credentials, externalReference, options)`, `getAsaasPayment(credentials, paymentId, options)`, `getAsaasPix(credentials, paymentId, options)` e `cancelAsaasPayment(credentials, paymentId, options)`. Cada operação aceita `options.fetch` e `options.signal` para testes; somente o POST de cartão usa 65 segundos, consultas usam 8 segundos. DELETE representa cancelamento, nunca confirmação de reembolso.

- [ ] Escrever testes que falhem para ausência dos contratos: CPF/CNPJ, e-mail, telefone, CEP, número/validade/CCV e inteiro monetário inválidos; mensagens não incluem o valor privado; chave e ambiente não pertencem ao input do cliente.
- [ ] Executar `node --test tests/asaas-payment-api.test.mjs` e confirmar RED pelos contratos ausentes.
- [ ] Implementar contratos e chamadas reais HTTP conforme a documentação oficial. Cadastro usa referência estável por usuário/ambiente; pagamentos usam referência única por tentativa. Validar resposta antes de reaproveitar IDs e não escolher automaticamente entre múltiplas cobranças com a mesma referência.
- [ ] Testar hosts fixos, `access_token` só no servidor, redirects bloqueados, GET sem body, POST de cartão com timeout de 65000 ms, IP do pagador e `authorizeOnly: false`. Testar 400 de recusa com classificação segura versus timeout/5xx/JSON inválido inconclusivos, sem persistir ou ecoar dados do cartão.
- [ ] Rodar a suíte focal até GREEN, mantendo os testes administrativos existentes, e fazer commit apenas dos arquivos desta tarefa.

Assertions mínimas do primeiro ciclo, com `test`/`assert` do runner existente:

```js
test("invalid card input never echoes the supplied number", () => {
  const number = "4111111111111112";
  assert.throws(
    () =>
      validateCard({
        holderName: "Fixture",
        number,
        expiryMonth: "13",
        expiryYear: "2020",
        ccv: "123",
      }),
    (error) => !error.message.includes(number) && !error.message.includes("123"),
  );
});
```

### Task 2: Pedido pendente, reservas e máquina de estados no banco

**Files:** gerar migration `asaas_transparent_payments` pelo CLI; modificar `src/integrations/supabase/types.ts`, `scripts/testing/checkout-database.mjs`; criar `supabase/tests/asaas-payments.sql`, `tests/asaas-payment-sql.test.mjs`; manter as migrations anteriores intactas.

**Interfaces:** produzir as RPCs acima, tabelas privadas `asaas_private.customers`, `asaas_private.payment_attempts` e `asaas_private.payment_issues`, colunas de processamento em `asaas_private.webhook_events`; adicionar `orders.payment_channel`, `orders.online_payment_state` e `orders.online_paid_at` com SELECT restrito e escrita protegida. Produzir `checkout_online_order` sem alterar o retorno existente `{order_id,total_cents,desconto_cents}`. Configuração ganha `online_enabled`, inicialmente false, e revisão do contrato de eventos registrados.

- [ ] Criar fixtures sintéticas e assertions SQL: online cria `pending_payment`, mantém `acceptance_deadline` nulo, reserva uma vez, total vem do banco, duas chaves não consomem o mesmo carrinho; canal offline mantém `placed` e deadline existente; total zero segue `free` sem tentativa Asaas.
- [ ] Executar `node --test tests/asaas-payment-sql.test.mjs` e confirmar RED antes da migration.
- [ ] Extrair o núcleo existente de checkout, preservando validações de contato, cidade, loja, adicionais, estoque e cupons. Implementar wrappers, tabelas RLS, privilégios de serviço e RPCs com bloqueios em ordem consistente. Nenhum custom GUC controlável pelo cliente pode autorizar estados ou alterações financeiras.
- [ ] Ajustar os gatilhos de prazo e notificação para `pending_payment → placed`: 60 segundos iniciados pelo servidor, uma única notificação à loja, nenhuma notificação na criação pendente. Não permitir progresso operacional enquanto o pagamento estiver pendente.
- [ ] Cobrir no contrato: lease concorrente de 180 segundos, liberação por token correto, eventos antes do attach, duplicação/reordenação, revisão alterada, valor/cliente/método divergente, confirmação tardia após cancelamento, estoque/cupom restaurados uma vez, cobrança desconhecida e ID de evento com `&`.
- [ ] Preservar a conferência manual: confirmação online não atualiza `payment_received_at` nem marca ledger como disponível. Bloquear liberação/saque de pedidos online com estorno/contestação; reembolsos só mudam para concluídos com snapshot verificado. Proteger também o RPC legado `record_order_refund` contra declaração manual de reembolso online sem comprovação do provedor.
- [ ] Bloquear alteração de chave/conta ou token enquanto houver cobranças/tentativas não conciliadas. Salvar nova configuração desliga novos pagamentos e exige revalidar os eventos registrados; não romper silenciosamente tentativas existentes.
- [ ] Rodar testes SQL locais e contrato real com rollback, somente fixtures fictícias. Conferir negação a anon/authenticated em todas as RPCs de serviço e permissões do DTO por papel; commit da tarefa.

### Task 3: Fronteira autenticada e orquestração de pagamentos

**Files:** criar `src/lib/asaas-payment-store.server.ts`, `src/lib/asaas-payment-service.server.ts`, `src/lib/asaas-payment.functions.ts`, `tests/asaas-payment-service.test.mjs`, `tests/asaas-payment-auth.test.mjs`; modificar `src/lib/checkout.functions.ts` sem alterar o fluxo de quote/na entrega.

**Interfaces:** `getOnlinePaymentAvailability() -> { enabled: boolean, methods: PaymentMethod[] }`, `startOnlineOrder({ checkout, payer, card? }) -> PaymentView`, `retryOnlinePayment({ orderId, payer, card? }) -> PaymentView`, `getOnlinePayment({ orderId }) -> PaymentView`, `refreshOnlinePayment({ orderId }) -> PaymentView`, `cancelOnlinePayment({ orderId }) -> PaymentView`. `startOnlineOrder` usa o método do checkout; operações posteriores recuperam o método persistido. Implementar `runPaymentAttempt(userId, orderId, payer, card, requestContext)` e `reconcilePayment(attempt)` no serviço; `requestContext` deriva IP/HTTPS no servidor, não do body. Disponibilidade é um DTO público ao usuário autenticado, sem exigir acesso ao módulo administrativo.

- [ ] Escrever testes comportamentais dos handlers reais, com mocks somente de transporte/serviços: JWT de usuário apagado, e-mail não confirmado, outro proprietário, outro papel, sessão trocada, configuração desativada e tentativa de selecionar Sandbox devem falhar antes de chamar o provedor.
- [ ] Executar os dois novos arquivos de teste e confirmar RED.
- [ ] Implementar middleware com `getUser()` fresco e identidade igual à autenticada. Reutilizar somente validações não sensíveis do checkout atual; parse de cartão retorna erro sanitizado, sem incluir input/objeto bruto em exceções. Exigir HTTPS nas chamadas que enviam cartão e obter IP por headers confiáveis da plataforma.
- [ ] Implementar a sequência: pedido persistido → claim da tentativa → associação do cliente → POST de pagamento → persistência do snapshot → DTO/Pix. Em resposta imediata confirmada, aplicar a mesma transação verificada usada pela conciliação; API e webhook nunca possuem regras diferentes para liberar pedidos.
- [ ] Testar duas abas deferred: somente uma faz POST; a segunda lê/reconcilia. Em timeout, marcar `uncertain`, consultar a referência e nunca fazer um segundo POST automático; resultado vazio continua inconclusivo. Em recusa definitiva, permitir somente nova tentativa explícita do usuário, com referência nova e sem dados antigos do cartão.
- [ ] Testar logout/troca de usuário durante resposta, repetição com total diferente, Pix retomado sem novo POST, cobrança encontrada com cliente/valor incorreto e erro sanitizado. GREEN e commit da tarefa.

### Task 4: Eventos, worker e expiração sem navegador

**Files:** modificar `src/lib/asaas-webhook.server.ts`, `src/lib/asaas-storage.server.ts`, `src/lib/asaas-api.server.ts`, `src/lib/admin-asaas.functions.ts`, `tests/asaas-webhook.test.mjs`, `tests/asaas.test.mjs`; criar `src/lib/asaas-payment-worker.server.ts`, `src/routes/api/internal/asaas-reconcile.ts`, `tests/asaas-payment-worker.test.mjs`; gerar migration `asaas_payment_reconciliation` pelo CLI; atualizar `vite.config.ts` e configuração Nitro/Vercel necessária.

**Interfaces:** `runAsaasPaymentWorker({ limit: 10, budgetMs: 70000 }) -> { processed, pending, failed }`; endpoint POST `/api/internal/asaas-reconcile` exige `ASAAS_RECONCILE_SECRET` com comparação constante. Secret dedicado privado, também armazenado no Vault para `pg_net`; nunca reaproveitar chave API Asaas ou token do webhook. Cron a cada minuto chama a origem canônica, não um domínio recebido no evento.

- [ ] Criar teste RED para ID real documentado `evt_05b708f961d739ea7eba7e4db318f621&368604920`; a primeira entrega persiste e repetição deduplica. Manter limites de corpo/tipo/tamanho e autenticação existentes.
- [ ] Corrigir a regra do ID no servidor e no banco, ampliar os eventos para confirmação, recebimento, risco, captura recusada, exclusão, reembolso parcial/integral e chargeback conforme a lista atual da Asaas. Marcar no status o contrato de eventos registrado; apenas um webhook com o novo contrato pode habilitar online.
- [ ] Processar somente IDs e metadados permitidos; o worker consulta a cobrança na Asaas e aplica snapshots verificados. Confirmar associação por ambiente, referência, cliente, método e valor. Evento antecipado fica pendente para conciliação; evento irrelevante pode ser concluído sem alterar pedido.
- [ ] Testar worker com navegador fechado, duas invocações concorrentes, lote 10, retry/backoff limitado e leases; falha de persistência nunca recebe ack como processada. Controlar a duração total em 70 segundos, sem iniciar item que não caiba no orçamento restante.
- [ ] Implementar `asaas_payment_work_complete` no adaptador e usar `done` após aplicação atômica ou evento irrelevante validado; `retry` para falha transitória; `review` para identidade/valor incompatíveis. Testar que operação antiga não libera o lease de outra invocação.
- [ ] Implementar expiração operacional aos 10 minutos, conciliando primeiro e cancelando a cobrança quando permitido. Timeout de cancelamento deixa `cancel_pending`; não declarar cancelamento bancário por causa do contador. Pagamento simultâneo ou tardio deve produzir um pedido pago válido ou pendência de reembolso, sem liberar duas reservas.
- [ ] Testar que cartão em análise/resultado incerto não dispara nova cobrança, nem a loja; testar reembolso parcial, estorno e disputa sem voltar de estado final para `pending`. As pendências sobrevivem a falhas e aparecem no admin.
- [ ] Configurar duração de função de 120 segundos na saída Vercel e verificar o arquivo gerado `.vc-config.json`; não adivinhar glob de função no `vercel.json`. Agendar o worker via Supabase Cron/pg_net, usando o padrão privado já existente em push; jobs sem credenciais ficam sem trabalho, sem erros contínuos.
- [ ] GREEN nos testes de webhook/worker/SQL e nas verificações de autenticação do endpoint interno; commit da tarefa.

### Task 5: Checkout e acompanhamento dentro do aplicativo

**Files:** criar `src/components/checkout/online-payment-form.tsx`, `src/components/checkout/order-payment-panel.tsx`, `tests/asaas-payment-ui.test.mjs`; modificar `src/routes/_authenticated/cliente.checkout.tsx`, `src/routes/_authenticated/cliente.pedido.$id.tsx`, `src/routes/_authenticated/cliente.pedidos.tsx`; preservar os testes de contato e transporte atuais.

**Interfaces:** `OnlinePaymentForm({ method, busy, onSubmit })` emite pagador/cartão somente na ação explícita do usuário; `OrderPaymentPanel({ payment, busy, onRefresh, onRetry, onCancel })` recebe somente `PaymentView`. Novos botões são Pix online/Cartão online e os meios na entrega permanecem identificados. Não trocar um pedido existente de canal ou método por mutação do formulário.

- [ ] Escrever testes RED dos componentes reais, seguindo `tests/helpers/load-tsx.mjs`: disponibilidade desligada, telefone/endereço faltando, submissão online, total zero e opção na entrega preservada.
- [ ] Implementar campos acessíveis com rótulos e validação, QR Code, copiar Pix e estados definidos na especificação. Não embutir página/iframe da Asaas. Mostrar código e botão alternativo selecionável se clipboard falhar.
- [ ] Guardar no máximo ID do pedido/tentativa na persistência opcional existente; nunca incluir pagador/cartão na fingerprint, quote, URL, query key, toast ou sessionStorage. Limpar campos sensíveis após tentativa, troca de método, logout e unmount.
- [ ] Testar que dois cliques não geram dois envios, botão de tentativa permanece bloqueado em `uncertain`, Pix pode ser retomado, recusa limpa campos e exige nova ação, erros não ecoam input, usuário novo não recebe resultado da conta anterior.
- [ ] Acompanhar pagamento por realtime/polling limitado e refresh ao retomar a aba, com controle de sequência como no pedido atual. Mostrar pedido pendente separado das etapas de preparo; só exibir o contador da loja em `placed`.
- [ ] Testar telas em largura de celular, teclado, contraste, labels e mensagens; verificar ausência de dados de cartão no storage/DOM após saída. GREEN e commit da tarefa.

### Task 6: Operação, configuração e financeiro administrativo

**Files:** criar `src/components/order-payment-badge.tsx`, `src/components/admin/asaas-payments.tsx`, `tests/asaas-payment-operations.test.mjs`; modificar `src/components/admin/asaas-settings.tsx`, `src/lib/admin-asaas.functions.ts`, `src/routes/_authenticated/admin.financeiro.tsx`, `src/routes/_authenticated/admin.pedidos.tsx`, `src/routes/_authenticated/estabelecimento.pedidos.tsx`, `src/routes/_authenticated/entregador.corridas.tsx`, `src/routes/_authenticated/entregador.index.tsx` e os componentes compartilhados dessas listas quando seus selects precisarem do estado.

**Interfaces:** admin usa `getAsaasOnlineStatus()`, `setAsaasOnlineEnabled({ enabled })`, `getAsaasPayments({ before?, limit? })`, `reconcileAsaasOrder({ orderId })`, todos com identidade confirmada e papel admin frescos. `OrderPaymentBadge({ channel, state })` não expõe PII e distingue **Pago online** de **Cobrar na entrega**. `AsaasPayments` apresenta bruto/estado/referência/pendências; não usa saldo da conta como saldo da loja.

- [ ] Escrever testes RED para ativação sem teste/webhook atual, papel não admin, alteração de configuração com tentativa ativa, admin sem cobranças e pedido pago cancelado antes de ser entregue.
- [ ] Implementar controle de ativação separado do seletor Testes/Produção, sempre desligado inicialmente. Desabilitar nova compra online quando a revisão está inválida e manter conciliação das compras existentes.
- [ ] Criar painel paginado de pagamentos e pendências independente do ledger de pedidos entregues: reembolso de um pedido cancelado antes da entrega também precisa aparecer. **Conferir na Asaas** busca snapshot real; não criar ação que marque pagamento/reembolso online apenas por texto de comprovante.
- [ ] Integrar o bloqueio de conferência manual e saques quando o estado online não for elegível. Um pagamento de cartão `CONFIRMED` ainda indisponível não pode ser tratado como `RECEIVED`. Manter a ação manual do admin para a liberação após disponibilidade e entrega, incluindo cupons existentes.
- [ ] Filtrar pedidos pendentes da fila/toque da loja e corridas; mostrar sinalização de já pago para loja/entregador após confirmação. Testar uma única notificação, falta de resposta aos 60 segundos gerando pendência de reembolso, e que o primeiro entregador a aceitar continua sendo o único designado.
- [ ] Implementar um diagnóstico Sandbox somente admin que cria cobranças com dados sintéticos identificados e sem registros em `public.orders`, estoque ou ledger reais; não reutilizar uma compra de cliente em produção para esse diagnóstico. Testes SQL com rollback cobrem as transições do pedido real.
- [ ] Rodar testes operacionais e regressões de permissões, approval, pedido/entrega/financeiro, corrigir achados e fazer commit da tarefa.

### Task 7: Homologação, migration e publicação

**Files:** atualizar `docs/asaas-configuration.md` com ativação, estados, conciliação e limites de homologação; ampliar `scripts/test-db.mjs` com o novo contrato local. Logs, tokens e relatórios privados continuam no diretório ignorado `.superpowers/sdd/2026-10-12-vercel-supabase/`.

**Interfaces:** manter os três aliases: `https://pedetrem.vercel.app`, `https://pedetrem-loja.vercel.app`, `https://pedetrem-entregador.vercel.app`. Usar a conexão CLI/API privada já fixada no projeto Supabase correto, sem imprimir tokens. `ASAAS_RECONCILE_SECRET` precisa existir no runtime Vercel e no Vault antes de habilitar o job.

- [ ] Ler as habilidades de revisão, verificação e deploy antes das ações correspondentes. Fazer revisão independente do fluxo completo; corrigir bloqueadores e repetir somente os testes afetados, depois a suíte final.
- [ ] Executar `node --test tests/*.test.mjs`, `node node_modules/typescript/bin/tsc --noEmit`, lint dos arquivos alterados, Prettier e `git diff --check`; exigir todos os testes passando, sem novo erro de lint. O build pode gerar o route tree antes da tipagem final.
- [ ] Rodar contratos SQL em banco local e no projeto correto com transação/rollback, inclusive concorrência, autorização e fluxo do pedido. Comparar advisors antes/depois; manter isolados os INFO esperados das tabelas privadas sem políticas. Não usar fixture que modifique cadastros reais fora da transação.
- [ ] Aplicar cada migration uma vez, gravar a versão no histórico e verificar o contrato instalado. Provisionar o segredo interno por canal privado; manter a ativação de produção false. Confirmar zero pedidos/cobranças reais criados pelos testes locais/SQL.
- [ ] Executar build Nitro/Vercel e inspecionar bundle público e inventário de deploy para ausência de segredos. Verificar duração de função gerada e autenticação do worker. Não ler e imprimir valores privados para demonstrar o resultado.
- [ ] Se houver chave Sandbox configurada pelo usuário no admin, homologar Pix, cartão aprovado/recusado/em análise quando suportado, callback recebido, conciliação após timeout e cancelamento, usando somente dados oficiais de teste. Se não houver chave ou permissão do provedor, registrar homologação externa pendente; nunca chamar mocks de teste real.
- [ ] Preservar avanços de `origin/main`, fazer commit/push normal e aguardar deployment READY para o SHA exato. Verificar todos os aliases e logs; testar publicamente webhook sem token retorna 401 e worker sem segredo retorna 401, sem alterar pagamentos.
- [ ] Executar `node scripts/check-independent-apps.mjs` e verificar os três perfis no navegador. Registrar separadamente o que foi observado e o que ainda depende de celular/conta Asaas.
- [ ] Atualizar a documentação e o andamento deste plano com evidências. Informar ao usuário o caminho no admin, o estado real da ativação e qualquer dependência de credencial; não afirmar recebimento online ativo enquanto desabilitado ou sem homologação.

## Critérios de conclusão

Uma compra online válida possui um único pedido, valor derivado do banco, cobrança associada, confirmação verificada e um único aviso à loja; o prazo de 60 segundos começa nesse momento. Pix e cartão funcionam na tela do PedeTrem e nenhum dado sensível do cartão é persistido. Cancelamentos, estornos, disputas e pagamentos tardios ficam conciliáveis no admin, e a liberação para saque mantém a conferência manual. Os pagamentos na entrega e as identidades dos três aplicativos continuam funcionando.

Código, contratos e publicação podem ficar prontos com produção desligada; isso deve ser reportado como **preparado para ativação**, não como **homologado na Asaas**. A conclusão integral da homologação exige a chave do usuário inserida pelo painel e evidência real de Sandbox.

## Referências verificadas

- [Cobrança de cartão no checkout próprio e timeout mínimo de 60 segundos](https://docs.asaas.com/reference/criar-cobranca-com-cartao-de-credito).
- [QR Code Pix, código copia e cola e validade bancária](https://docs.asaas.com/reference/obter-qr-code-para-pagamentos-via-pix).
- [Consulta de cobrança pela referência externa](https://docs.asaas.com/reference/listar-cobrancas).
- [Eventos financeiros da Asaas](https://docs.asaas.com/docs/webhook-para-cobrancas).
