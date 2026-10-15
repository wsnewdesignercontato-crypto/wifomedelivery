# Brevo no painel administrativo

O usuário aprovou configurar a **chave API** em **Admin → Configurações → Integrações · Brevo**. Esse fluxo substitui a preparação anterior com SMTP: o administrador não precisa informar host, porta ou senha SMTP.

A tela e o backend foram verificados em banco local isolado. A migration `20261014215702_brevo_admin_integration.sql` ainda precisa ser aplicada no Supabase próprio `nsvgfagjezdduatmbsqq`: o login CLI deixou de ser aceito e foi solicitada nova autenticação ao proprietário. Não houve envio real nem ativação do Auth Hook remoto.

## Configuração pelo administrador

1. Entre ou [crie uma conta Brevo gratuita](https://onboarding.brevo.com/account/register), usando `wsnewdesignercontato@gmail.com` para este projeto, conforme escolha do proprietário.
2. Em [Remetentes](https://app.brevo.com/senders), cadastre `PedeTrem` com o endereço pretendido e confirme a verificação diretamente no painel. Sem domínio próprio, a Brevo pode substituir o endereço exibido por um domínio da plataforma. [Remetentes](https://help.brevo.com/hc/en-us/articles/208836149), [substituição de domínio](https://help.brevo.com/hc/en-us/articles/14925263522578).
3. Abra **Configurações → SMTP e API → API** na Brevo e crie uma chave API para o aplicativo. A chave SMTP e a senha da conta não servem neste campo.
4. No admin, cole a chave em **Chave API da Brevo**, confirme nome/e-mail do remetente e clique **Salvar Brevo**. O campo fica vazio após salvar: a chave não é devolvida ao navegador. Deixe em branco nas próximas alterações para mantê-la.
5. Clique **Enviar teste para meu e-mail**. O destinatário é sempre o e-mail confirmado da sessão administrativa. Há intervalo mínimo de 60 segundos entre tentativas. A aceitação pela API não garante entrega: confira caixa de entrada, spam e logs da Brevo.

Alterações do remetente ou da chave exigem novo teste. A tela informa separadamente a conexão testada e a ativação do envio automático. Não envie chaves, senhas ou códigos pelo chat ou Git.

O plano gratuito inclui 300 envios por dia, sem acumular cota não usada. Mensagens transacionais podem ficar em fila ao atingir a cota. [Limites oficiais](https://help.brevo.com/hc/en-us/articles/208580669).

## Ativação operacional do envio automático

Esta é uma configuração única da infraestrutura; a chave Brevo continua sendo gerenciada pelo admin do aplicativo.

1. Após renovar o login, confira a identidade/projeto e aplique **somente** a migration nova em `nsvgfagjezdduatmbsqq`. O histórico anterior já foi inicializado: não reaplicar o bootstrap nem as migrations antigas. Execute `supabase/tests/brevo.sql` para verificar permissões, preservação de chave, cooldown e deduplicação, com rollback dos dados de teste.
2. Publique a versão validada na Vercel e confirme o endpoint HTTPS `/api/auth/send-email` no domínio final, com frontend/servidor no mesmo banco.
3. Cadastre e teste a chave pelo admin. No Supabase, configure **Authentication → Hooks → Send Email → HTTP**, URL `https://wifomedelivery.vercel.app/api/auth/send-email`. O hook substitui SMTP; não precisa de um token de gerenciamento Supabase na aplicação. Não usar preview protegido. [Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook).
4. Crie o segredo de assinatura do hook e guarde o mesmo valor no Supabase e na variável privada Vercel `AUTH_EMAIL_HOOK_SECRET`. O backend aceita `v1,whsec_...`. Configure `AUTH_EMAIL_HOOK_ENABLED=true` somente junto com a ativação efetiva do hook, após testar a chave/remetente. Faça novo deployment para carregar essas variáveis quando necessário. Não imprimir o segredo.
5. Mantenha provedor de e-mail e confirmação de cadastro habilitados. Verifique cadastro, recuperação e retorno ao domínio final com uma conta do proprietário. Os links passam pelo endpoint de verificação Supabase. O backend permite as origens exatas de `APP_URL` e do deployment atual `VERCEL_URL`; outros domínios/previews exigem revisar essa lista e os Redirect URLs Supabase.

Enquanto o hook estiver desativado, o Supabase mantém o envio SMTP existente. Não ativar antes de ter chave/remetente testados e endpoint público funcional. Se habilitado sem configuração ou com assinatura inválida, o endpoint recusa o envio. Para retornar ao transporte anterior, desative o Send Email Hook no Supabase e a flag privada do servidor; preserve a chave criptografada.

## Proteção e validação

A chave fica criptografada no Vault. Tabelas internas em `brevo_private` têm RLS e nenhum acesso de `anon`/`authenticated`. Os sete RPCs aceitam apenas `service_role`; o servidor verifica conta confirmada e papel admin antes de ler status, salvar ou testar. Respostas do painel contêm somente metadados. [Vault](https://supabase.com/docs/guides/database/vault).

O Auth Hook valida assinatura Standard Webhooks e timestamp antes de acessar credenciais, limita o corpo e não registra tokens ou endereços. A deduplicação guarda ID/hash/estado com lease e retenção limitada, sem corpo do e-mail. Cada mensagem usa UUID determinístico para a idempotência Brevo, incluindo reconhecimento de requisições já aceitas. [Idempotência Brevo](https://developers.brevo.com/docs/heterogenous-versions-batch-emails).

Testes locais: ACL/privacidade no banco; RPC real com negação a cliente/anônimo e chave oculta; formulário no navegador e envio com provedor **simulado**, sem mensagens externas. Ainda faltam aplicar a migration remota, configurar chave real e verificar entrega/ativação em produção.
