# Pagamento no checkout do PedeTrem com Asaas

Estado: proposta para revisão. A configuração da Asaas no admin já está publicada; o pagamento online descrito aqui ainda não foi implementado.

## Objetivo e decisões existentes

O usuário confirmou que quer os dois: configuração da Asaas no administrador e pagamento no checkout do cliente. O pagamento deve permanecer ligado ao pedido correto, aos avisos do estabelecimento e ao acompanhamento do cliente, sem duplicar cobranças.

Preservar Supabase `nsvgfagjezdduatmbsqq`, o projeto Vercel `wifomedelivery` e os três aplicativos com suas origens e identidades de instalação. As credenciais ficam no Vault e são usadas exclusivamente pelo servidor. Não solicitar chaves, senhas ou códigos pelo chat.

Preservar as decisões anteriores sobre cupons: a loja paga seu próprio cupom e a plataforma paga o cupom da plataforma. Preservar a conferência manual pelo admin para disponibilizar saldo de saque; confirmação do pagamento online não autoriza automaticamente repasses ou saques.

## Alternativas e recomendação

1. **Checkout hospedado pela Asaas, recomendado.** O pedido começa no PedeTrem, o cliente paga na página segura da Asaas e retorna ao acompanhamento no aplicativo. Aceita Pix e cartão na modalidade de pagamento único; os dados bancários e de cartão são preenchidos na Asaas.
2. **Checkout transparente.** Mantém a tela de pagamento dentro do aplicativo, mas exige implementar e validar os fluxos de cartão, titular, autorização e possíveis recusas. Altera mais componentes e amplia o tratamento de dados sensíveis.
3. **Fatura de cobrança da Asaas.** Outra página externa, baseada na API de cobranças e cadastro do cliente na Asaas. Permite avaliar boleto, mas exige uma jornada própria de identificação e vencimento.

A proposta abaixo usa a primeira alternativa. A preferência entre página da Asaas e tela interna foi perguntada ao usuário e ainda não foi respondida. Esta proposta não trata silêncio como aprovação.

O checkout hospedado documentado oferece Pix e cartão, não boleto. Boleto não será anunciado como disponível nessa implementação. Dinheiro e os meios já oferecidos para pagamento na entrega permanecem claramente separados dos novos meios online.

## Jornada do cliente

1. O cliente continua navegando sem login. Ao comprar, mantém as exigências existentes de autenticação, telefone e endereço quando necessário para a entrega.
2. O checkout distingue **Pix online**, **Cartão online** e **Pagamento na entrega**. As opções online aparecem somente quando o administrador habilitar a integração de produção e a revisão atual tiver chave testada e webhook registrado.
3. O servidor calcula o total com os preços, adicionais, frete e cupom do banco. Não aceita um valor financeiro fornecido pelo navegador como autoridade.
4. Ao escolher pagamento online, cria o pedido em `pending_payment`, reserva estoque e cupom e cria uma sessão de pagamento único Asaas, com validade de 10 minutos. O total enviado inclui frete e desconto, exatamente em centavos, sem recalcular taxas no navegador.
5. O servidor persiste o identificador da sessão e sua associação com o pedido antes de entregar o link ao navegador. O cliente pode retomar o mesmo pagamento pela página do pedido.
6. Ao voltar da Asaas, a tela exibe o estado salvo no servidor. Uma URL de sucesso não prova pagamento. Enquanto não chegar a confirmação válida, mostra **Aguardando confirmação do pagamento**.
7. Depois da confirmação, o pedido passa para `placed`, a loja recebe um único aviso e começa o prazo existente de 60 segundos para aceitar. O restante do fluxo de preparo, despacho e entrega permanece o mesmo.

Um pedido totalmente coberto por desconto, com total zero, segue pelo fluxo gratuito validado pelo servidor, sem tentativa de criar uma cobrança de valor zero.

## Integração e persistência

Estender o módulo Asaas existente com um serviço servidor para criar sessões, montar URLs de pagamento por ambiente e processar os eventos de checkout. Não adicionar um segundo provedor nem expor a chave no cliente.

Registrar separadamente pedido, ambiente, revisão da configuração, referência externa, identificador da sessão, valor esperado, método, expiração e estado da tentativa. Usar uma relação privada e DTOs específicos: o cliente vê apenas suas próprias informações de pagamento; o admin vê os dados de conciliação; estabelecimento e entregador não recebem chaves nem dados de cartão.

Usar a chave de idempotência existente do checkout e bloqueio compartilhado por tentativa. Cliques repetidos e respostas fora de ordem não criam novos pedidos nem expõem duas sessões para o mesmo pedido. Uma falha antes de receber a resposta da Asaas fica identificada como tentativa inconclusiva; não gerar silenciosamente outra cobrança nem afirmar que a criação falhou com certeza. Uma sessão que não foi persistida não pode ser apresentada como link de pagamento ao cliente.

O ambiente é escolhido pelo servidor. A produção pública nunca usa Sandbox. Testes de Sandbox ficam restritos ao admin, com identificação visual e sem envio de pedidos às lojas reais, sem repasses e sem alterações no estoque real.

O admin ganha um controle explícito para habilitar o pagamento online em produção, inicialmente desligado. Salvar outra chave ou mudar a revisão exige novo teste e registro do webhook antes de disponibilizar novos pagamentos. Pedidos existentes continuam identificados pela configuração e conta que os criaram; impedir troca silenciosa de conta com pagamentos ativos e exigir conciliação antes dessa troca.

## Eventos e sincronização

Adicionar ao cadastro do webhook `CHECKOUT_CREATED`, `CHECKOUT_PAID`, `CHECKOUT_CANCELED` e `CHECKOUT_EXPIRED`, mantendo os eventos financeiros necessários para conciliar recebimentos, estornos e contestações.

Validar o token do webhook antes de interpretar o corpo. Corrigir o formato de identificador de evento: a documentação oficial contém IDs com `&`, que a validação atualmente publicada rejeita. Manter limites de tamanho e rejeição de controles, com a mesma regra no servidor e no banco.

Persistir os metadados necessários antes de responder sucesso. Processar cada evento de forma idempotente, com bloqueio do pedido, sem regressão de estado causada por eventos antigos. Um evento de sessão desconhecida não pode confirmar um pedido por coincidência de referência externa.

Confirmar sessão, conta/ambiente, associação ao pedido e valor contra os registros da integração. Quando necessário para conciliação financeira, consultar a cobrança vinculada na API; um nome de evento isolado ou o redirecionamento do navegador não basta para liberar valores.

Somente a confirmação válida de produção pode mover `pending_payment` para `placed`. Alterar o gatilho de prazo para não contar os 60 segundos durante o pagamento e alterar a notificação da loja para cobrir a transição `pending_payment → placed` sem duplicar os avisos de pedidos pagos na entrega.

## Expiração, cancelamento e reembolso

Sessão cancelada ou expirada sem pagamento cancela o pedido pendente e devolve estoque e uso do cupom uma única vez. Um processo periódico recupera pendências mesmo se o navegador estiver fechado, respeitando a confirmação do estado na Asaas e a margem para entrega atrasada dos eventos.

Se a confirmação chegar depois de o pedido ter sido cancelado ou o estoque ter sido liberado, não ressuscitar o pedido. Registrar a ocorrência e abrir uma pendência de reembolso para o admin, com aviso claro ao cliente.

Pedidos pagos cancelados pela loja, pelo cliente ou pelo prazo de resposta também geram pendência de reembolso. O sistema não pode mostrar **Reembolsado** antes da confirmação real do provedor. A primeira entrega mantém análise administrativa do reembolso; não executa devoluções automaticamente. O admin acompanha referência, valor e estado e registra a devolução efetuada na Asaas, com validação do recebimento do evento correspondente.

Não confundir autorização do cartão, pagamento confirmado e saldo disponível na Asaas. Continuar respeitando a conferência manual para saldo de saque. Eventos de estorno ou contestação bloqueiam nova liberação e geram uma pendência administrativa visível; não enviar transferências automáticas.

## Financeiro e telas dos outros perfis

Admin: visualizar pedido, meio online/entrega, valor bruto, estado do pagamento, identificadores Asaas, confirmação, expiração e pendências de reembolso/conciliação. Não usar o saldo total da conta Asaas como saldo da loja ou do entregador.

Estabelecimento: pedidos pendentes de pagamento não entram na fila de novos pedidos nem disparam o toque. Após confirmação, receber o pedido uma única vez e mostrar a informação de pagamento online para não cobrar novamente na entrega.

Entregador: manter a disputa atômica existente por corrida e o despacho após a preparação. Mostrar que o pedido já foi pago online, evitando cobrança duplicada do cliente. Não oferecer uma corrida apenas porque uma sessão de pagamento foi criada.

## Verificação e liberação

- Validar autorização, propriedade do pedido, ambiente e revisão em todas as operações de pagamento.
- Testar total alterado, desconto integral, dois cliques, duas abas, timeout de criação, retorno sem webhook e webhook antes da resposta de criação.
- Testar IDs de evento com `&`, repetição e reordenação dos eventos, token inválido, valor divergente, sessão desconhecida e tentativa de usar Sandbox em pedido real.
- Testar que o prazo da loja só inicia após confirmação e que notificação/toque ocorrem uma única vez. Verificar que pedidos na entrega mantêm o comportamento atual.
- Testar expiração e cancelamento concorrentes ao pagamento, estoque e cupom restaurados uma vez, pagamento tardio e pendência de reembolso.
- Testar conferência manual, saldo de saque, cupons, estornos e contestações sem dupla liberação.
- Rodar os contratos SQL com rollback e credenciais fictícias; verificar os três aplicativos, testes, tipagem, lint, build e artefatos públicos.
- Homologar o fluxo completo no Sandbox com a chave informada no painel. Essa homologação depende da credencial e não pode ser substituída por mocks apresentados como teste real.
- Publicar na Vercel com o controle de produção desligado; ativar após homologação e configuração de produção. Não criar cobranças reais de teste sem instrução explícita.

## Referências e pontos confirmados no código

- `src/lib/checkout.functions.ts`: cria pedido via `checkout_order` com idempotência.
- `src/routes/_authenticated/cliente.checkout.tsx`: hoje comunica pagamento na entrega; precisa distinguir os canais.
- `supabase/migrations/20261016025222_audit_checkout_finance.sql`: cálculo transacional, reservas, cupons e conferência manual.
- `supabase/migrations/20261018201942_order_acceptance_deadline.sql`: atualmente inicia 60 segundos no INSERT; deve respeitar pagamento pendente.
- `supabase/migrations/20260801164309_7528cbf4-b282-426d-a2a3-575de2401257.sql`: aviso da loja hoje acontece somente no INSERT com `placed`.
- [Criar checkout](https://docs.asaas.com/reference/criar-novo-checkout).
- [Eventos de checkout](https://docs.asaas.com/docs/checkout-events).
- [Perguntas sobre checkout](https://docs.asaas.com/docs/asaas-checkout-faq).
- [Eventos de cobranças](https://docs.asaas.com/docs/webhook-para-cobrancas).
