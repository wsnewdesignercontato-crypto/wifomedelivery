# Limpeza de testes e safeupdate

A limpeza do simulador remove somente vendas simuladas, seus registros vinculados e as autorizações privadas de compra de teste. Cadastros e pedidos reais permanecem intactos. O registro administrativo da limpeza é mantido.

A proteção `safeupdate` do PostgREST exige `WHERE` em exclusões. A rotina captura os IDs das autorizações de teste sob o lock administrativo existente e exclui somente esses IDs. A proteção permanece habilitada; limpar novamente uma lista vazia é permitido.

O teste PGlite do simulador verifica isolamento de pedidos, estoque e perfis, revogação de autorizações e idempotência. Como ele não carrega o módulo safeupdate, o contrato específico de produção fica em `supabase/tests/payment-test-cleanup-rollback.sql`: instale temporariamente, execute o RPC pelo PostgREST somente como service_role e remova a função de ensaio ao terminar. O helper força rollback de todos os efeitos da limpeza; ele não integra as migrations nem fica disponível para clientes/admins autenticados comuns.
