# Estado da migração — 14 de outubro de 2026

A migração está em andamento. O destino Supabase próprio foi inicializado e verificado; os três cadastros anteriores eram testes descartáveis. O código independente está publicado em preview na Vercel; a ativação de produção depende das configurações e verificações abaixo.

- Conta Vercel verificada pela API: `wsnewdesignercontato@gmail.com`, identificador `wsnewdesignercontato-6856`.
- Projeto: `wifomedelivery`, ID `prj_W25oUTDeJ8ygGbngzNBtB8JAxIYZ`.
- Integração Git conectada a `wsnewdesignercontato-crypto/wifomedelivery`, com produção na branch `main`. [PR #1 em rascunho](https://github.com/wsnewdesignercontato-crypto/wifomedelivery/pull/1); a branch `main` permanece sem as mudanças da migração.
- [Preview protegido com mapa gratuito e wifome](https://wifomedelivery-qdnd4fgkb-wsnewdesignercontato-6856.vercel.app), deployment `dpl_x5hXLnFsesJx2Vmxxw3itDSpaDxf`, commit `47f73f2` (código do mapa `111cc59`). Deployment pronto e verificações HTTP/RPC concluídas.
- Domínio padrão confirmado no projeto: `wifomedelivery.vercel.app`. `APP_URL` e `VITE_APP_URL` estão configuradas para essa origem somente em Production; previews preservam suas próprias origens.
- Banco de destino: `wifome/nsvgfagjezdduatmbsqq`. A conexão nova e a chave administrativa de servidor estão configuradas e foram usadas pelo preview acima. O banco anterior não foi alterado.
- Login Supabase pelo CLI concluído no perfil `wifomedelivery-ws`. O usuário confirmou que os três cadastros antigos são testes e podem ser recriados. O destino próprio estava vazio e recebeu a estrutura verificada do app, sem copiar usuários ou dados antigos.
- O preview novo `dpl_DertyMZKnqMZDvbVi1rcBBKicf8y` foi bloqueado por autoria Git sem permissão no time. A identidade de login Vercel continua sendo WS; novos commits usam o e-mail WS confirmado pelo usuário, sem reescrever os commits anteriores.
- Mapa gratuito aprovado: OpenStreetMap/Leaflet dentro do aplicativo, GPS externo sem API. Verificado no painel local com um marcador temporário do Supabase e créditos visíveis; cinco testes do helper, suíte total 52, tipos e builds Node/Vercel passaram. IA e geocoding opcional ficam para depois.
- Branch de trabalho: `codex/migrate-vercel-supabase`.
- O usuário não possui domínio ou SMTP e pediu uma opção gratuita. SMTP Gmail sugerido para o início; [configuração preparada](free-email-setup.md), aguardando criação e entrada da senha de app diretamente pelo proprietário nos painéis Google/Supabase. Nenhum SMTP foi ativado ou testado ainda.

## Verificações concluídas

- Inicialização local e remota aprovada: 51 tabelas com RLS, 637 colunas, 47 funções do app, quatro buckets privados, trigger Auth e 17 relações realtime. As 9.705 permissões de funções/tabelas/colunas coincidiram com a reconstrução original antes do endurecimento adicional. Defaults do provedor preservados.
- Testes de isolamento de clientes e logs administrativos passaram local e remotamente, com fixtures revertidas. A view administrativa agora respeita RLS; RPC legado de cidade por ID e funções internas foram restringidos. O advisor continua sinalizando `public_reviews`, que preserva uma projeção pública intencional, e funções autenticadas autorizadas no corpo.
- 52 testes, TypeScript e builds Node/Vercel aprovados. Revisão independente concluída; a correção de OIDC foi verificada com o SDK real.
- Versões corrigidas para CVE-2026-102989 instaladas: Start 1.168.60 e server-core 1.169.39; Router alinhado em 1.170.41. IDs, caminhos e pais das rotas preservados.
- 13 endpoints HTTP verificados pelo CLI Vercel autenticado: páginas públicas, sitemap, robots, manifest e oito imagens. As imagens mantêm seus tamanhos originais e a origem pública está correta.
- Funções de cidade e IA rejeitam chamadas sem sessão. O transporte RPC retorna o erro de autenticação serializado.
- No preview com mapa gratuito, cliente foi impedido de chamar RPC administrativo de mapa e IA; o administrador acessou o Supabase próprio pelo servidor. Dispatch rejeitou segredo incorreto (401) e aceitou o configurado (200, zero envios). A IA não foi chamada e nenhuma notificação real foi enviada.
- As duas contas Auth e a loja temporária criadas para verificação foram removidas após saída global das sessões. Perfis e papéis associados ficaram ausentes; o projeto próprio voltou a zero usuários Auth. Nenhum cadastro antigo foi excluído.
- Arquivos de ambiente e credenciais locais excluídos do upload; verificação real do coletor aprovada. Bundle público verificado sem credenciais de servidor ou endpoints Lovable.
- Lint dos arquivos alterados aprovado. O lint geral ainda tem dívida preexistente: 3510 erros e 8 avisos na execução registrada.

O checker Node de HTTP encontrou encerramentos intermitentes de conexão com imagens grandes no preview. As verificações completas pelo CLI Vercel confirmaram status 200, tipos e tamanhos de todas as 13 respostas. O checker local passou nas 13 verificações.

O registro de produção `dpl_uy3qTJYh8zq4h8mvmZFG6XbTHqrG` está em `ERROR/BLOCKED_PACKAGE`, por usar o Start original vulnerável. O preview acima contém a correção já verificada. Não houve promoção desse preview nem ativação bem-sucedida de produção.

## Etapas necessárias para produção

1. Configurar e testar SMTP para cadastro/confirmação e recuperação de clientes externos. O SMTP padrão é restrito à equipe; a opção Gmail gratuita está documentada, mas falta a credencial criada pelo proprietário.
2. Concluir o cadastro real inicial e verificar o domínio de produção. Mapa gratuito e preview passaram nos 13 endpoints, RPC administrativo, negação de acesso a clientes e dispatch push (401 incorreto/200 autorizado sem assinaturas). As credenciais privadas Supabase, dispatch e VAPID JWK estão configuradas; assinatura VAPID e payload criptografado foram verificados sem enviar notificações a dispositivos.
3. IA adiada pelo usuário. O AI Gateway permanece sem liberação de faturamento; nenhuma configuração de pagamento foi alterada. O geocoding automático também é opcional; a seleção manual de cidade continua disponível.
4. Verificar cadastro/confirmação de e-mail, recuperação e operação dos quatro perfis no domínio final. Login administrativo e mapa integrado passaram no navegador local; cliente/admin passaram na API e RLS. A entrega push em dispositivo e o fluxo completo de pedido ainda não foram testados.
5. Verificar o deployment com as configurações novas e publicar/promover somente após validar os fluxos. Site URL/Redirect URLs e Vault já apontam à produção confirmada; MFA, confirmação de e-mail e parâmetros de OTP foram preservados.
6. Concluir a integração da branch de migração após as verificações. Retirar a sincronização e a publicação Lovable depois que os fluxos de produção estiverem verificados.

Configure segredos diretamente no painel ou CLI autorizado, nunca em mensagens, commits ou nesta documentação. As contas previamente autenticadas no computador foram preservadas.
