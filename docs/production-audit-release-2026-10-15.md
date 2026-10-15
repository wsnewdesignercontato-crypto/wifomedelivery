# Publicação das correções — 15/10/2026

- Produção: https://pedetrem.vercel.app
- Conta Vercel confirmada: wsnewdesignercontato-6856.
- Projeto: wifomedelivery / prj_W25oUTDeJ8ygGbngzNBtB8JAxIYZ.
- Commit funcional: 744a7c69f1249871de55a3476d92ef235cf69d4d, enviado à main sem reescrever histórico.
- Supabase confirmado: wifome / nsvgfagjezdduatmbsqq / PostgreSQL 17.6.

## Aplicação e evidências

A primeira migração foi ensaiada no PostgreSQL do destino em transação revertida. Foi salvo um checkpoint privado das funções, triggers e permissões existentes. A migração 20261015203710 foi aplicada em transação e registrada no histórico. O deployment de produção dpl_GZPeemWFKQvqG8tXBpHdbwrpGFfZ foi validado e promovido; o domínio principal passou a responder com os novos termos. Em seguida, a migração 20261015205302 foi aplicada e registrada.

O smoke SQL no banco ativo, sempre com ROLLBACK, passou antes e depois da segunda etapa: cotação com preço autoritativo, desconto, recusa de carteira, confirmação como authenticated, idempotência, estoque, uso de cupom, limpeza do carrinho e devolução única no cancelamento. Não sobraram usuários nem pedidos dos testes. A contagem inicial e final permaneceu em um usuário e zero pedidos.

A conferência final confirmou bloqueio de INSERT direto em orders e INSERT/UPDATE/DELETE em order_items; anon sem EXECUTE em quote_checkout/submit_checkout; authenticated com EXECUTE em submit_checkout; ambas as versões no histórico de migrations.

O deployment validado respondeu HTTP 200 em /, /auth, /termos, /privacidade, /equipe, /sitemap.xml, /robots.txt e /manifest.webmanifest. A verificação HTTP de /equipe não equivale a um teste autenticado da área. Os 80 testes locais, typecheck, lint sem avisos e build já estavam aprovados.

## Limites e apontamentos preservados

Não foi executada compra persistente, teste de carga simultânea nem sessão de navegador autenticada de cliente/loja/entregador. O texto jurídico ainda requer validação da identificação do operador.

Os advisors de segurança foram consultados. Continuam apontamentos do projeto: public_reviews usa security_definer para publicar uma projeção de avaliações de lojas aprovadas, enquanto a tabela-base é restrita aos participantes; trocar simplesmente para invoker suprimiria a leitura pública. A revisão dessa arquitetura permanece pendente. Também há avisos de funções SECURITY DEFINER: os quatro novos RPCs são intencionais, limitados a authenticated e verificam auth.uid()/identidade. Os avisos de RPCs legados e da função de evento rls_auto_enable precisam de revisão separada. A proteção contra senhas vazadas está desativada; não foi alterado o plano de serviço.

Estes limites não devem ser descritos como auditoria integral sem pendências ou garantia de funcionamento de todos os perfis.
