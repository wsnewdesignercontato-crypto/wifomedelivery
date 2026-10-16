# Correções da auditoria PedeTrem

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** corrigir os achados A01–A18, preservando usuários/dados e validando cliente, loja, entregador e administrador.

**Architecture:** autorização efetiva no PostgreSQL e transações para checkout/saques. Dados bancários acessíveis apenas pelo proprietário/admin; códigos de entrega guardados fora das tabelas replicadas. A interface consome projeções seguras e operações autorizadas. TanStack Start/Vercel e o projeto Supabase atual são preservados.

**Tech Stack:** React/TypeScript, TanStack Start, Supabase/PostgreSQL, Bun e Vercel.

**Spec:** relatório local `auditoria-pedetrem-2026-10-15.md`, achados A01–A18. O proprietário pediu corrigir todos e aprovou: cupom da loja custeado pela loja; cupom global custeado pela plataforma; saldo disponível somente após confirmação manual de recebimento pelo administrador.

## Restrições

- Preservar histórico Git; não reescrever migrations aplicadas.
- Nenhuma transferência financeira real, envio em massa ou acesso a outra plataforma.
- Conta admin atual preservada; Brevo real depende da configuração do proprietário.
- Provar negações por identidade/papel no banco; não depender somente de botões ocultos.
- Testar em PostgreSQL local antes de aplicar migrations no projeto `nsvgfagjezdduatmbsqq`.

## Revisão

Repetições/concorrrência no checkout e saques; seleções de colunas privadas e realtime; estados nulos/legados de cadastro; descontos superiores à comissão; falha entre criação de ticket e primeira mensagem. Cada caso pertence aos contratos abaixo.

## Execução

- [x] Baseline: 76 testes passam; branch `codex/audit-repairs` em worktree existente.
- [x] Dependências: atualizar lockfile sem mudar runtime principal, verificar registry e regressões.
- [ ] A02/A03/A04/A06/A07/A16: `20261015155437_audit_access_controls.sql`, `access-controls.sql`, projeções seguras e chat. Testes RED existentes; aplicar localmente e obter GREEN, incluindo RPCs legítimas e dados históricos.
- [ ] A01/A05/A08–A14: `20261015155438_audit_checkout_finance.sql`, `commerce-integrity.sql`, checkout atômico, reservas/limites, cupons e conferência manual. Validar repetição, valor real do catálogo, saldo agregado, centavos e rejeição de escrita direta.
- [ ] A15/A18: `20261015155450_support_runtime_settings.sql`, conversa de suporte por ticket, contatos administrativos, busca global paginada e preferências efetivas do dispositivo. Validar permissões e falhas de rede.
- [ ] Regenerar tipos a partir do esquema local; testes unitários, contratos PostgreSQL, TypeScript e build. Conferir lint dos arquivos alterados e limitações anteriores.
- [ ] Revisar diferenças e compatibilidade; publicar preview apontando para ambiente de teste, testar os fluxos no navegador sem alterar sessão do proprietário.
- [ ] Aplicar somente migrations novas no projeto autorizado; validar contrato com rollback, publicar produção, conferir alias e smoke HTTP/autorização.
- [ ] Atualizar relatório com evidências, alterações e pendências reais (Brevo/dispositivo/Lovable).

## Interfaces

- `get_establishment_private(uuid)` e `get_order_delivery_code(uuid)`: retorno JSON somente ao participante autorizado.
- `checkout_order(uuid,uuid,text,text,jsonb,text,text)`: sessão autenticada, preço de catálogo, chave idempotente, retorno `{order_id,total_cents,desconto_cents}`.
- `wallet_summary(text,uuid)` / `request_withdrawal(text,integer,uuid)`: saldo completo com reservas e solicitação transacional.
- `settle_order_payment(uuid,text)`: admin confirma recebimento; não executa transferência bancária.
- `admin_search_users(text,integer,integer)`: busca em todas as contas com paginação limitada.
- `create_support_ticket(text,text)`: ticket e primeira mensagem na mesma transação; conversa restrita ao titular/admin.

Os agentes de implementação interromperam por limite de uso; o agente principal continuará sobre os arquivos já salvos e verificará cada alteração.
