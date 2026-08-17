# Plano de Sincronização e Auditoria WiFome

Este plano visa garantir que os quatro módulos do WiFome (Landing, Cliente, Loja e Entregador) estejam sincronizados em termos de fluxos de dados, segurança e experiência do usuário.

## Fases de Implementação

### 1. Sincronização de Fluxo e Notificações (Realtime)
* **Status do Pedido:** Revisar o `PedidoPage` (cliente) e `DashboardPage` (loja) para garantir que as assinaturas do Supabase Realtime estejam capturando todas as transições de status, especialmente do `placed` até `delivered`.
* **Novas Corridas:** Validar o `NewRideOffer` no entregador para garantir que a lógica de geofencing e a sirene toquem instantaneamente quando um pedido entra em `broadcasting`.
* **Chat:** Verificar se as notificações push e alertas visuais de novas mensagens estão funcionando nos três perfis.

### 2. Auditoria de Segurança e RLS
* **Permissões de Tabelas:** Executar uma varredura nas tabelas sensíveis (`orders`, `deliveries`, `platform_ledger`) para garantir que as políticas de RLS impeçam que um entregador veja dados de outro, ou que um cliente veja lucros da loja.
* **Segurança de Código:** Validar que `codigo_entrega` e `cancellation_reason` só possam ser alterados pelos perfis corretos através de funções RPC ou políticas de `UPDATE` estritas.

### 3. Ajustes de UI/UX e Consistência Visual
* **Logo e Branding:** Garantir que o `IFomeLogo` e os filtros de cor (Laranja/Vermelho/Verde) sejam aplicados consistentemente em todas as telas, incluindo modais e notificações.
* **Onboarding:** Validar se o `OnboardingGate` está bloqueando corretamente o acesso a funções premium enquanto os dados obrigatórios não forem preenchidos nos 3 perfis.
* **Consistência de Textos:** Revisar rótulos de botões e mensagens de sucesso/erro para que sigam o tom de voz premium do WiFome em todos os aplicativos.

### 4. Correções de Performance e Mobile
* **Debounce de Rolagem:** Revisar o `use-reveal-on-scroll.ts` para garantir que a rolagem em dispositivos móveis continue fluida mesmo com muitas animações.
* **PWA:** Verificar se os 3 manifestos (`WiFome`, `WiLoja`, `WiMoto`) estão sendo detectados e sugeridos corretamente para instalação.

## Detalhes Técnicos

* **Supabase Realtime:** Otimizar canais para reduzir o uso de banda, filtrando por ID de usuário ou estabelecimento diretamente na assinatura.
* **CSS Global:** Padronizar as variáveis de cor oklch no `styles.css` para evitar variações cromáticas não planejadas entre as telas.
* **RPCs:** Migrar lógicas complexas de validação de entrega para `SECURITY DEFINER` no banco de dados, protegendo contra manipulação no frontend.
