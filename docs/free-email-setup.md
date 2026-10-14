# E-mails de cadastro e recuperação com Brevo

O usuário escolheu Brevo no plano gratuito, substituindo a sugestão anterior de Gmail SMTP. A conexão é feita no Supabase Auth e mantém os templates de autenticação do aplicativo. A criação/liberação da conta, a verificação do remetente e a chave SMTP ainda estão pendentes; nenhum envio pela Brevo foi testado.

## Conta e remetente

1. Entre na conta Brevo pretendida ou [crie uma conta gratuita](https://onboarding.brevo.com/account/register). Use `wsnewdesignercontato@gmail.com` caso esteja criando a conta para este projeto; faça login, definição de senha, verificação e aceite dos termos diretamente no navegador.
2. Em [Remetentes](https://app.brevo.com/senders), cadastre o nome `PedeTrem` e o e-mail `wsnewdesignercontato@gmail.com`. Confirme o endereço com o código enviado pela Brevo, diretamente no painel. [Instruções oficiais](https://help.brevo.com/hc/en-us/articles/208836149).
3. Como ainda não há domínio próprio, a Brevo documenta uma substituição temporária do endereço de remetente por um endereço compatível da plataforma. O destinatário pode ver um domínio da Brevo em vez de `gmail.com`. Não tente autenticar `gmail.com` nem `vercel.app`, que não são domínios administrados pelo usuário. Quando houver domínio próprio, autentique-o e revise o remetente. [Comportamento documentado](https://help.brevo.com/hc/en-us/articles/14925263522578).
4. Confirme que os e-mails transacionais/SMTP estão liberados na conta. Se a Brevo exigir revisão ou ativação, conclua essa etapa antes de substituir um SMTP em funcionamento.

## Conectar ao Supabase

1. Abra [Brevo / SMTP e API](https://app.brevo.com/settings/keys/smtp). Copie o valor específico de **Login SMTP** mostrado na sua conta. Ele pode ser diferente do e-mail de login, inclusive no formato `[ID]@smtp-brevo.com`.
2. Gere uma **chave SMTP** chamada `Wifome Supabase`, variante padrão. Use a chave SMTP no campo senha, não uma chave API nem a senha da conta Brevo. [Credenciais SMTP](https://help.brevo.com/hc/en-us/articles/7924908994450), [gerenciamento de chaves](https://help.brevo.com/hc/en-us/articles/7959631848850).
3. No [Supabase wifome / SMTP](https://supabase.com/dashboard/project/nsvgfagjezdduatmbsqq/auth/smtp), ative SMTP personalizado e configure:

| Campo | Valor |
| --- | --- |
| E-mail do remetente | `wsnewdesignercontato@gmail.com`, verificado na Brevo |
| Nome do remetente | `PedeTrem` |
| Host | `smtp-relay.brevo.com` |
| Porta | `587` |
| Usuário | Login SMTP exibido pela Brevo |
| Senha | Chave SMTP criada na Brevo |

Host, credenciais e portas foram conferidos na documentação oficial de [SMTP Brevo](https://help.brevo.com/hc/en-us/articles/7924908994450) e [portas SMTP](https://help.brevo.com/hc/en-us/articles/10905415650322).

4. Cole a chave somente no painel Supabase e salve. Não envie chaves, senhas ou códigos pelo chat, pelo Git ou em documentação. A chave não deve virar uma variável `VITE_*` nem ser configurada na Vercel para os e-mails do Supabase Auth.
5. Confirme a entrega de um cadastro e de uma recuperação de senha em uma caixa controlada pelo proprietário, usando o aplicativo. Verifique também o remetente real recebido, os links, o retorno ao app e os logs transacionais da Brevo. Esses testes permanecem pendentes.

## Limites e operação

O plano gratuito Brevo inclui 300 envios por dia, sem acumular a cota não utilizada; campanhas e e-mails transacionais compartilham essa capacidade. Ao atingir a cota, e-mails transacionais podem ficar em fila e atrasar a confirmação ou recuperação. [Limites oficiais](https://help.brevo.com/hc/en-us/articles/208580669).

O Supabase documenta um limite inicial separado de 30 mensagens por hora ao habilitar SMTP próprio, ajustável no painel. A cota de 300/dia da Brevo continua valendo. O SMTP padrão Supabase é restrito à equipe; a confirmação de e-mail permanece ativa. [Documentação Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

Depois de salvar SMTP no painel, preservar esses valores ao sincronizar `config.toml` pelo CLI: não executar um push de configuração antiga que desative ou sobrescreva o SMTP. Nunca imprimir a chave durante comparação de configurações. A Brevo pode desativar chaves inativas ou expiradas; acompanhar avisos e renovar diretamente nos painéis quando necessário.
