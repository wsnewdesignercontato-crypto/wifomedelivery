# Estado da migração — 14 de outubro de 2026

A migração está em andamento. O código independente está publicado em preview na Vercel; a ativação de produção depende das configurações e verificações abaixo.

- Conta Vercel verificada pela API: `wsnewdesignercontato@gmail.com`, identificador `wsnewdesignercontato-6856`.
- Projeto: `wifomedelivery`, ID `prj_W25oUTDeJ8ygGbngzNBtB8JAxIYZ`.
- Integração Git conectada a `wsnewdesignercontato-crypto/wifomedelivery`, com produção na branch `main`. [PR #1 em rascunho](https://github.com/wsnewdesignercontato-crypto/wifomedelivery/pull/1); a branch `main` permanece sem as mudanças da migração.
- [Preview protegido](https://wifomedelivery-cjv7xfdto-wsnewdesignercontato-6856.vercel.app), deployment `dpl_CSbREU2Y3SqHy6n5up228uNfyoKa`, código do commit `b1eaefa`.
- Domínio padrão confirmado no projeto: `wifomedelivery.vercel.app`. `APP_URL` e `VITE_APP_URL` estão configuradas para essa origem somente em Production; previews preservam suas próprias origens.
- Banco de destino: `wifome/nsvgfagjezdduatmbsqq`. A conexão nova e a chave administrativa de servidor estão configuradas na Vercel; um novo deployment ainda precisa incorporar esses valores. O banco anterior não foi alterado.
- Login Supabase pelo CLI concluído no perfil `wifomedelivery-ws`. O usuário confirmou que os três cadastros antigos são testes e podem ser recriados. O destino próprio estava vazio e recebeu a estrutura verificada do app, sem copiar usuários ou dados antigos.
- Branch de trabalho: `codex/migrate-vercel-supabase`.

## Verificações concluídas

- Inicialização local e remota aprovada: 51 tabelas com RLS, 637 colunas, 47 funções do app, quatro buckets privados, trigger Auth e 17 relações realtime. As 9.705 permissões de funções/tabelas/colunas coincidiram com a reconstrução original antes do endurecimento adicional. Defaults do provedor preservados.
- Testes de isolamento de clientes e logs administrativos passaram local e remotamente, com fixtures revertidas. A view administrativa agora respeita RLS; RPC legado de cidade por ID e funções internas foram restringidos. O advisor continua sinalizando `public_reviews`, que preserva uma projeção pública intencional, e funções autenticadas autorizadas no corpo.
- 47 testes, TypeScript e builds Node/Vercel aprovados. Revisão independente concluída; a correção de OIDC foi verificada com o SDK real.
- Versões corrigidas para CVE-2026-102989 instaladas: Start 1.168.60 e server-core 1.169.39; Router alinhado em 1.170.41. IDs, caminhos e pais das rotas preservados.
- 13 endpoints HTTP verificados pelo CLI Vercel autenticado: páginas públicas, sitemap, robots, manifest e oito imagens. As imagens mantêm seus tamanhos originais e a origem pública está correta.
- Funções de cidade e IA rejeitam chamadas sem sessão. O transporte RPC retorna o erro de autenticação serializado.
- Arquivos de ambiente e credenciais locais excluídos do upload; verificação real do coletor aprovada. Bundle público verificado sem credenciais de servidor ou endpoints Lovable.
- Lint dos arquivos alterados aprovado. O lint geral ainda tem dívida preexistente: 3510 erros e 8 avisos na execução registrada.

O checker Node de HTTP encontrou encerramentos intermitentes de conexão com imagens grandes no preview. As verificações completas pelo CLI Vercel confirmaram status 200, tipos e tamanhos de todas as 13 respostas. O checker local passou nas 13 verificações.

O registro de produção `dpl_uy3qTJYh8zq4h8mvmZFG6XbTHqrG` está em `ERROR/BLOCKED_PACKAGE`, por usar o Start original vulnerável. O preview acima contém a correção já verificada. Não houve promoção desse preview nem ativação bem-sucedida de produção.

## Etapas necessárias para produção

1. Publicar e verificar o novo preview conectado a `wifome`. Estrutura, Auth callbacks, histórico de 80 versões e Vault de dispatch já foram configurados. Snapshot e testes estão em `supabase/bootstrap/`; não reaplicar o histórico antigo.
2. Configurar as chaves próprias Google de Maps e geocoding na Vercel. A chave administrativa Supabase, o segredo de dispatch e o novo par VAPID já estão configurados para o destino vazio; não há assinaturas antigas nele.
3. Liberar o AI Gateway na conta Vercel. O teste com dados fictícios retornou HTTP 403 informando a exigência de cartão cadastrado para liberar os créditos gratuitos; nenhuma configuração de pagamento foi alterada.
4. Verificar sessões, recuperação de senha, os quatro perfis, Google Maps, IA, realtime e push no destino. Dispatch atualmente retorna 503 por falta da configuração privada; a rejeição 401 e a entrega push ainda precisam ser verificadas.
5. Verificar o deployment com as configurações novas e publicar/promover somente após validar os fluxos. Site URL/Redirect URLs e Vault já apontam à produção confirmada; MFA, confirmação de e-mail e parâmetros de OTP foram preservados.
6. Concluir a integração da branch de migração após as verificações. Retirar a sincronização e a publicação Lovable depois que os fluxos de produção estiverem verificados.

Configure segredos diretamente no painel ou CLI autorizado, nunca em mensagens, commits ou nesta documentação. As contas previamente autenticadas no computador foram preservadas.
