# Alertas de atendimento e prazo da loja

- Novos pedidos recebem `acceptance_deadline` no servidor, com 60 segundos. Pedidos anteriores à migration mantêm prazo nulo.
- A loja recebe um toque em loop em qualquer tela enquanto houver pedido pendente dentro do prazo. Aceite, cancelamento, expiração e retomada do app reconciliam o estado.
- A contagem aparece no painel da loja, no pedido da loja e no acompanhamento do cliente.
- O servidor recusa o aceite tardio. O job `pedetrem-expire-unaccepted-orders` verifica pedidos vencidos a cada 10 segundos, sem depender de um navegador aberto.
- A expiração usa os gatilhos de cancelamento existentes: histórico, aviso ao cliente e devolução idempotente de estoque/cupom. Não cria devoluções financeiras automáticas.
- O comando atômico de aceite de entregas foi preservado: somente um entregador obtém a corrida.
- Avisos de corrida são enviados aos entregadores aprovados, online, disponíveis e na área já configurada. Ofertas direcionadas avisam somente o destinatário.
- Foi removido o segundo alerta do entregador. A oferta reconcilia disponibilidade a cada 4 segundos, pois RLS pode ocultar o UPDATE que atribuiu a entrega a outro usuário.
- O toque respeita som/vibração do aparelho e requer a interação permitida pelo navegador. Em app fechado/suspenso, o aviso depende de push e das permissões do sistema; não há garantia de música contínua em segundo plano.

## Verificação

331 testes passaram, incluindo o controlador real de alerta da loja, prazo exato, aceite tardio, expiração idempotente e destinatários da oferta. TypeScript e lint dos arquivos alterados passaram.

O contrato `supabase/tests/order-acceptance-flow.sql` passou no esquema completo de produção com rollback: checkout, dois entregadores disputando a entrega, conclusão com prova, prazo, cancelamento, recuperação exata do estoque e uma única notificação ao cliente. As funções privadas de expiração são inacessíveis a anon/authenticated. O agendador foi ativado e a auditoria de segurança não apontou novos problemas nas funções alteradas.

Toque em aparelhos físicos e entrega de push em Android/iOS distintos não são demonstrados por estes testes.
