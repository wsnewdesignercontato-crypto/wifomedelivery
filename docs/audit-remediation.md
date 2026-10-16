# Correções da auditoria de 15/10/2026

Base examinada: `e6add399ef73029739c101ea7cf1e69675e2984f`.

## Situação

Publicado em https://pedetrem.vercel.app, com ambas as migrations aplicadas no Supabase correto e commit funcional 744a7c6 na main. Consulte [o registro de publicação](production-audit-release-2026-10-15.md) para evidências e pendências. As limitações locais abaixo registram a etapa anterior à publicação.

## Mudanças por achado

| Auditoria | Correção implementada |
| --- | --- |
| A01 | Triggers impedem alteração de aprovação, KYC, score e avaliação pelo próprio usuário, inclusive no INSERT; exclusão de cadastro operacional por usuário comum é recusada. Admin e rotinas internas preservam acesso. |
| A02 | Cotação e criação consultam catálogo, adicionais obrigatórios, disponibilidade e estoque agregado; preço informado pelo carrinho é ignorado. Escrita direta de pedidos/itens é bloqueada na etapa final. Valores financeiros de pedidos ficam imutáveis para gravações comuns. |
| A03 | Pedido, itens, estoque, cupom e limpeza das linhas compradas pertencem à mesma transação PostgreSQL. Erro em qualquer etapa reverte tudo. |
| A04 | Lock transacional por usuário e chave de idempotência com índice único. A repetição da mesma confirmação retorna o pedido existente. A interface preserva o payload para repetir uma confirmação de resposta incerta. |
| A05 | Validação com lock e incremento atômico do cupom. Pedido referencia o cupom. Cancelamento devolve uso e estoque uma vez. Reembolso de pedido entregue não repõe mercadoria consumida. |
| A06 | Ledger registra desconto e financiador; bruto corresponde à soma de repasses e receita da plataforma. Trigger duplicado removido. Não reescreve lançamentos históricos. |
| A07 | Carteira removida do checkout e recusada no servidor/banco. Não há simulação de débito nem implementação de uma carteira financeira nova. |
| A08 | Loja fechada é recusada pelo banco na cotação e confirmação. |
| A09 | Tela apresenta subtotal, desconto e total da cotação autoritativa. Mudança de preço/carrinho exige nova revisão. |
| A10 | Convite criado no app e aceito pela conta com e-mail confirmado. Nova área `/equipe`, com consulta dos pedidos das lojas aceitas e teste de isolamento. Não envia e-mail nem concede administração/pagamentos. |
| A11 | Páginas públicas `/termos` e `/privacidade`, com links no rodapé, no perfil e no sitemap. Texto descreve a operação implementada; responsável deve validar sua identificação e o conteúdo antes da publicação comercial. |
| A12 | Âncora de entregadores e links rápidos corrigidos; redes sem URL removidas; lojas de apps apresentadas como “em breve”, sem falso link de download. |
| A13 | Formatação normalizada; `any` removidos dos seis pontos; dependências de hooks corrigidas. Lint passa sem erros nem avisos. |

A Central de ajuda também substitui contatos fictícios por registro e consulta de solicitações na tabela de suporte já existente. Nenhum chamado real foi criado nesta execução.

## Regras financeiras explícitas

Cupons globais são registrados como financiados pela plataforma; cupons de uma loja, por essa loja. O valor da comissão continua separado. A receita líquida da plataforma absorve a diferença necessária para conciliar o total, podendo ficar negativa quando há subsídio. O cadastro deve refletir essa regra comercial antes de usar cupons reais. A mudança não realiza cobranças, pagamentos, saques ou estornos e não corrige automaticamente o histórico.

A reserva de estoque ocorre na confirmação. Cancelamento anterior à entrega devolve unidades e uso do cupom, uma vez. Não reativa automaticamente um produto desativado. Descontos, complementos e preços são revalidados na confirmação; valores alterados não são aceitos silenciosamente.

## Testes e limites

- 80 testes JavaScript/TypeScript, incluindo transporte RPC e execução da migração/testes SQL em PostgreSQL 18.6 embarcado (PGlite 0.5.10).
- SQL cobre preço adulterado, estoque, complementos obrigatórios/repetidos, falha real no INSERT dos itens com rollback, idempotência, cupons, cancelamento, ledger, proteção de campos e identidade/isolamento de convites.
- TypeScript e build Node aprovados com configuração pública fictícia, sem credenciais de produção.
- ESLint com `--max-warnings=0`: aprovado.
- 15 endpoints locais do build: aprovados. Âncoras e documentos SSR conferidos.
- A fixture usa tabelas/enums versionados e os triggers/policies relevantes; não replica todas as extensões e políticas do Supabase. Não substitui validação no PostgreSQL do projeto ativo.
- O mecanismo usa locks transacionais e índice único; falta teste de carga com múltiplas conexões no ambiente de destino. O teste embarcado de repetição não é prova de carga concorrente em produção.
- O navegador remoto não alcançou o servidor local, portanto não houve aprovação visual/end-to-end das áreas autenticadas corrigidas. Capturas de produção antigas não foram usadas como evidência da nova versão.
- Advisories e logs autenticados do projeto correto não foram consultados por falta de acesso.

## Aplicação em duas etapas

Confirmar primeiro conta, projeto, histórico de migrations e backup operacional, sem reaplicar o bootstrap.

1. Aplicar **somente** `20261015203710_secure_checkout_and_profile_fields.sql` em preview/base de validação e depois no destino autorizado. A migração adiciona funções e proteções; mantém temporariamente os privilégios necessários ao frontend antigo. Não aplicar automaticamente a segunda nesta etapa.
2. Publicar e validar a versão que usa `quote_checkout`/`submit_checkout`: compra, desconto, repetição, cancelamento e bloqueios entre perfis. Validar páginas públicas, equipe e suporte.
3. Depois do frontend confirmado, aplicar `20261015205302_enforce_checkout_write_path.sql`, que revoga INSERT direto em pedidos e INSERT/UPDATE/DELETE direto em itens. Repetir os testes de acesso e checkout. **A02 só está fechada no banco após esta etapa.**
4. Executar advisors/logs no Supabase correto e confirmar o deployment/commit em produção. A aplicação final bloqueia clientes antigos que tentem usar o caminho de escrita anterior; orientar atualização do app quando necessário.

Não executar um `db push` que aplique ambas antes da troca de frontend. Depois da segunda etapa, rollback apenas do frontend para o handler antigo quebra o checkout; preparar correção compatível ou roll-forward. Não reabrir os privilégios vulneráveis como solução automática.

Verificações locais reproduzíveis:

```sh
bun install --frozen-lockfile
npm test
npm run typecheck
npm run lint -- --max-warnings=0
npm run build
node scripts/smoke-migration.mjs https://URL-DO-PREVIEW
```

Configurar variáveis reais pelos canais privados autorizados, nunca em commits ou mensagens.
