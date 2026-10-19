# Teste de compra completa

Em **Administração → Configurações → Pagamentos · modo de teste**, ative o modo, selecione uma conta de cliente, a loja e, para entrega, o entregador aprovado. Clique em **Liberar compra de teste**. A autorização vale por 24 horas, para aquela conta e aquela loja; pode ser removida antes.

Na conta liberada, monte o carrinho no aplicativo do cliente com produtos e complementos do catálogo. Na finalização aparece **TESTE · compra completa sem cobrança** e o botão **Confirmar pedido de teste**. Pix e cartão são aprovados internamente, sem cobrança, QR Code de pagamento ou contato com o Asaas.

O pedido usa as regras normais de cadastro, endereço, loja aberta, preço, cupom, estoque disponível e complementos obrigatórios. A loja recebe o pedido, aceita e prepara; ao chamar a entrega, somente o entregador escolhido recebe a oferta. Ele precisa estar online, livre, aprovado e atuar na cidade da loja. O cliente acompanha as etapas e recebe as mensagens, inclusive “Seu pedido está a caminho!”. A conclusão exige a mesma confirmação de entrega do fluxo normal.

Pedidos de teste permanecem identificados como TESTE, não devem ser preparados ou entregues de verdade e não alteram estoque, contador de cupom, saldo para saque, avaliação, ranking ou comissão real. A confirmação usa o servidor e a mesma validação de catálogo do checkout normal; preços enviados pelo navegador não são aceitos como autoridade. Repetir a mesma tentativa não duplica pedido.

**Desligar** impede novas compras de teste. Contas não liberadas e compras em outras lojas continuam no checkout normal. A configuração Asaas Sandbox/Produção é independente. Este teste valida o fluxo operacional interno; não comprova recebimento de dinheiro pelo gateway.

**Limpar testes** remove somente vendas, pedidos, corridas, mensagens e avisos vinculados aos testes, e revoga as autorizações de teste. Produtos, usuários, vendas reais e saldos são preservados. O registro administrativo da limpeza permanece. O comando antigo de demonstração permanece compatível para registros anteriores.

## Notificações e áudio

A central do cliente mostra as 50 mensagens mais recentes, inclusive as lidas, com o texto completo. O contador considera apenas as não lidas. A lista reconcilia eventos do banco, recebimento de push, retorno ao aplicativo e atualização periódica com a tela visível. O cabeçalho usa um sino, sem estrelinhas de IA.

Uma corrida direcionada em `broadcasting` continua sendo uma oferta; não é entrega aceita. Essa distinção permite abrir a oferta e iniciar a música. O toque usa o MP3 configurado e para ao aceitar, recusar ou perder a corrida. A liberação de áudio depende de interação com o aplicativo e da preferência de som. Não é garantida música contínua quando o sistema suspende um PWA em segundo plano ou bloqueia a tela.

## Verificação

- Testes de checkout com preço e complemento reais, repetição, total adulterado, conta não autorizada, cancelamento sem reposição indevida e isolamento de saldos.
- Contrato `supabase/tests/realistic-checkout-test.sql`, com as fixtures de `order-acceptance-flow.sql`, executado em transação e revertido: compra, aceite da loja, despacho, aceite do entregador, código de conclusão, notificações visíveis sob RLS e limpeza seletiva.
- Testes da central preservam mensagens lidas e reconciliam atualizações.
- Testes de oferta direcionada e do MP3 em loop, desbloqueio, silêncio, cancelamento e parada imediata.
