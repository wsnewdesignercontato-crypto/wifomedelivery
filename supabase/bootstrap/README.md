# Inicialização do Supabase próprio

Destino autorizado: `wifome/nsvgfagjezdduatmbsqq`, na conta `wsnewdesignercontato@gmail.com`. O usuário confirmou que os três cadastros antigos eram testes e poderiam ser recriados. Não há cópia ou exclusão de dados no projeto anterior.

`20261013041244_initialize_wifome_destination.sql` é um snapshot transacional da estrutura final das 79 migrations originais. Ele recusa tabelas, views, rotinas, enums, usuários Auth ou buckets preexistentes, excetuando objetos de extensões e a rotina gerenciada `rls_auto_enable()`. Use somente em um destino vazio verificado. Nunca execute como complemento automático do histórico antigo.

A reconstrução local omitiu a concessão de administrador a uma conta antiga e corrigiu `lower(coalesce(cp.status::text,''))`, pois `cp.status` é um enum. As migrations originais permanecem intactas. O snapshot contém somente configurações iniciais do produto, sem clientes, pedidos, usuários, arquivos ou segredos.

Antes de restaurar as permissões do app, o snapshot remove concessões herdadas dos defaults de Supabase nos objetos novos. Defaults e rotinas do provedor são preservados. Testes locais reproduziram os defaults do destino e compararam 9.705 permissões de funções, tabelas e colunas com a reconstrução original: zero diferenças. O mesmo resultado foi verificado remotamente antes do endurecimento adicional abaixo.

Foram criados quatro buckets privados (`avatars`, `chat-attachments`, `delivery-proofs`, `ad-banners`), as 14 políticas Storage existentes, o trigger de cadastro e as 17 relações de realtime. Todos os 51 objetos de tabela do app têm RLS; as 637 colunas esperadas pelo cliente foram verificadas.

Depois do snapshot, aplicar `../migrations/20261014201245_harden_destination_access.sql`. Ela faz a view administrativa respeitar RLS e restringe o RPC legado de cidade por ID arbitrário e as funções internas. O app continua usando o RPC autenticado de dois argumentos. `public_reviews` preserva a projeção pública de avaliações de estabelecimentos aprovados: sua execução como proprietário é intencional para não conceder acesso à tabela completa `reviews`. O advisor ainda sinaliza essa view e funções autenticadas com autorização no corpo; esses avisos exigem interpretar o uso, não abrir acesso às tabelas privadas.

Verificar `verify-destination.sql` e `tests/access.sql`. O segundo arquivo usa dados sintéticos em uma transação com rollback; não envia e-mails nem preserva contas de teste. Ele confirma que clientes não leem logs administrativos, administradores continuam lendo e o RPC legado não está disponível ao navegador.

Depois de verificar a estrutura, registrar como aplicadas as versões históricas correspondentes com `supabase migration repair --linked --status applied ...`. Esse registro descreve o snapshot já restaurado; não reaplica os arquivos antigos. Conferir `migration list` e `db push --dry-run` antes de migrations futuras. Validar sempre o ref vinculado e colocar o argumento global `--profile wifomedelivery-ws` antes do subcomando.

Chaves reais ficam em arquivos locais ignorados e no ambiente autorizado da Vercel. Auth mantém confirmação de e-mail e MFA. Os callbacks usam a origem de produção, localhost e os previews deste projeto. Cadastro/login, Google Maps, IA e entrega push ainda exigem validação no destino antes de retirar a publicação antiga.
