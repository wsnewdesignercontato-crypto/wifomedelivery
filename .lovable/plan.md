---
title: Plano de Sincronização e Auditoria WiFome
date: 2026-08-17
---

# Plano de Sincronização e Auditoria WiFome

## Objetivo
Resolver inconsistências entre o frontend e o banco de dados (RPCs ausentes), sincronizar fluxos de tempo real e auditar a segurança RLS para garantir que os 4 apps (Cliente, Loja, Entregador e Admin) funcionem de forma coesa e segura.

## 1. Fundação e Banco de Dados (Database Routines)
- [x] Restaurar `confirm_pickup_order`: Criar RPC no banco para permitir que lojas confirmem entregas de retirada (Pickup).
- [x] Restaurar `check_profile_complete`: Criar RPC para o `OnboardingGate` validar dados obrigatórios.
- [x] Criar `set_active_city`: Permitir que o cliente atualize sua localização preferencial.
- [ ] Verificar triggers de status: Garantir que a mudança de `delivery_status` para `delivered` dispare o `platform_ledger` corretamente.
- [ ] Implementar `confirm_delivery_code`: Uma RPC segura para o entregador validar o código de 4 dígitos (atualmente feito no frontend, o que é menos seguro).

## 2. Realtime e Sincronização
- [ ] **Cliente**: Otimizar inscrição no canal de pedidos para refletir mudanças de status instantaneamente no `cliente.pedido.$id.tsx`.
- [ ] **Entregador**: Ajustar `new-ride-offer.tsx` para garantir que ofertas desapareçam imediatamente após serem aceitas por outros entregadores.
- [ ] **Estabelecimento**: Sincronizar painel de novos pedidos com som de alerta persistente até a primeira interação.

## 3. Segurança e RLS (Auditoria Profunda)
- [ ] **Privacidade**: Garantir que o telefone do cliente só seja visível para o entregador/loja através da RPC `get_order_client_contact` (já existente, mas precisa de revisão de grants).
- [ ] **Grants**: Executar bloco de `GRANT EXECUTE` em todas as RPCs públicas para o role `authenticated`.
- [ ] **RLS**: Revisar políticas de `orders` e `deliveries` para evitar vazamento de coordenadas de GPS entre entregadores.

## 4. UI/UX e Consistência Visual
- [ ] **Loading**: Padronizar o `WifomeLoader` em todas as transições de rota pesadas.
- [ ] **Mobile**: Ajustar comportamentos de "Pull to Refresh" que podem conflitar com o scroll premium em telas de listagem.
- [ ] **Status**: Unificar cores de badges de status entre os 4 módulos (verde para entregue, laranja para em preparo, etc).

## Detalhes Técnicos
- Uso de `SECURITY DEFINER` em RPCs críticas para bypass de RLS controlado.
- Otimização de filtros em `postgres_changes` para reduzir tráfego de rede.
- Padronização de tratamento de erros no frontend para RPCs (ex: tratar `invalid_code`, `code_expired`).
