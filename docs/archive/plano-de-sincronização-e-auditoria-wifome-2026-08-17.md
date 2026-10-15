# Plano de Sincronização e Auditoria WiFome

## Objetivo
Garantir que os 4 módulos (Cliente, Estabelecimento, Entregador e Admin) funcionem de forma síncrona, segura e sem bugs de fluxo.

## 1. Sincronização de Fluxos (Realtime)
- [x] **Cliente**: Otimizado `cliente.pedido.$id.tsx` para refletir status e posição do GPS sem recarregar.
- [x] **Entregador**: Ajustado `new-ride-offer.tsx` para remover ofertas aceitas por outros em tempo real.
- [x] **Estabelecimento**: Adicionado alerta sonoro (`siren.mp3`) e toast persistente em `estabelecimento.pedidos.tsx` para novos pedidos.

## 2. Auditoria de Segurança e Integridade (RPCs)
- [x] **Confirmação de Entrega**: Migrada lógica de validação de código do frontend para a RPC `confirm_delivery_code` (Atômico: valida código + atualiza status + gera extrato).
- [x] **Confirmação de Retirada**: Implementada RPC `confirm_pickup_order` para segurança em pedidos sem entregador.
- [x] **Onboarding**: Criada RPC `check_profile_complete` para evitar que usuários sem dados obrigatórios operem no app.
- [x] **Financeiro**: Implementado trigger no DB para que o `platform_ledger` seja alimentado automaticamente ao marcar como entregue.

## 3. Melhorias de UI e Consistência
- [x] **Loader Universal**: Padronizada animação de ícones (Sanduíche -> Loja -> Moto) em todos os apps.
- [x] **Status Visual**: Padronizados tons de verde para entregue e vermelho para cancelado/problema.
- [ ] **Admin**: Melhorar logs de auditoria para incluir nome do admin responsável.

## 4. Próximos Passos
- [ ] Testar fluxo fim-a-fim: Cliente (Paga) -> Estabelecimento (Aceita/Pronto) -> Entregador (Aceita/Coleta/Entrega).
- [ ] Validar bloqueio de múltiplos apps instalados no mesmo dispositivo (identificação de perfil).
