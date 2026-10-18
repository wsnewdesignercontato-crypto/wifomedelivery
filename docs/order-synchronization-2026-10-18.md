# Sincronização dos pedidos e aprovação de lojas

## Problemas reproduzidos

- A loja recebia avisos de KYC, mas não da aprovação do cadastro comercial. O sino administrativo era apenas um ícone.
- Os alertas assinavam somente inserções: resolver uma pendência em outra sessão não removia o aviso da tela aberta.
- O acompanhamento do cliente não representava `waiting_courier` nem `arriving`.
- As telas com consultas manuais dependiam de montagem e eventos Realtime. Não reconciliavam eventos perdidos durante suspensão ou perda da conexão.
- Despacho, aceite e etapas da entrega gravavam corrida e pedido em chamadas separadas. Uma falha intermediária podia deixar os estados divergentes.

## Comportamento esperado

Um cadastro de loja pendente avisa os administradores no sino, com acesso à fila de aprovação. Aprovar resolve os avisos administrativos e notifica somente o proprietário no público de estabelecimento. Não altera as regras de aprovação nem aprova cadastros automaticamente. A validação financeira/KYC continua independente.

As telas devem buscar novamente o estado autorizado ao retomar o aplicativo ou reconectar o Realtime, ignorando respostas antigas e respostas depois da desmontagem. O acompanhamento precisa representar todas as etapas produzidas pelo fluxo.

O despacho, aceite e avanço precisam confirmar as alterações de corrida e pedido na mesma transação, com autorização e bloqueio de concorrência. Concluir entrega continua exigindo o código/prova no RPC existente.

## Verificação

Os contratos SQL de checkout real, ciclo de checkout e integridade comercial foram executados no projeto `nsvgfagjezdduatmbsqq`, com fixtures temporárias, autenticação simulada por papel e rollback. As fixtures forneceram telefone/endereço obrigatórios e contexto administrativo durante sua preparação. A contagem de pedidos e corridas foi preservada.

O contrato de notificações foi executado no banco de destino antes da aplicação, com rollback. Os testes locais verificam destinatários, aprovação idempotente, isolamento do proprietário, função interna não executável pelo navegador, navegação com query string e reconciliação do sino em outra sessão.

As duas migrations foram aplicadas no destino. O contrato integrado de entrega passou novamente nas funções instaladas: checkout, preparo, despacho, aceite, etapas da corrida e confirmação com código. Falhas injetadas na gravação do pedido desfizeram também a alteração da corrida. Repetições foram idempotentes; outro entregador, contas não aprovadas e conclusão sem prova foram recusados. O frete da oferta usa o valor confirmado no pedido. Nenhum pedido real foi alterado.

Validação do conjunto: 328 testes passaram; TypeScript, lint dos arquivos alterados sem avisos e build Vercel passaram. O lint geral conserva quatro avisos anteriores ao delta. O pacote público foi verificado sem valores de credenciais privadas. A entrega em ambiente real entre celulares distintos permanece uma verificação operacional, além destes testes de banco e componentes.

Esses contratos não demonstram entrega de push em um celular físico nem recuperação de conexão em todas as versões de Android/iOS. O aviso em segundo plano depende da permissão e da inscrição do aparelho.
