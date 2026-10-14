# E-mails de cadastro e recuperação sem domínio próprio

Configuração inicial sugerida para baixo volume: SMTP do Gmail da conta `wsnewdesignercontato@gmail.com`. Não exige comprar um domínio. A configuração ainda não foi salva nem testada; depende da senha de app criada pelo proprietário da conta.

## Configurar diretamente nos painéis

1. Entre na conta Google correta e ative a verificação em duas etapas, caso ainda não esteja ativa.
2. Abra [Senhas de app](https://myaccount.google.com/apppasswords) e crie uma entrada chamada `Wifome Supabase`.
3. Abra [Authentication / SMTP do projeto wifome](https://supabase.com/dashboard/project/nsvgfagjezdduatmbsqq/auth/smtp), ative SMTP personalizado e preencha:

| Campo | Valor |
| --- | --- |
| E-mail do remetente | `wsnewdesignercontato@gmail.com` |
| Nome do remetente | `PedeTrem` |
| Host | `smtp.gmail.com` |
| Porta | `465` (SSL/TLS) |
| Usuário | `wsnewdesignercontato@gmail.com` |
| Senha | Senha de app criada no Google |

4. Cole a senha somente no painel Supabase e salve. Não use a senha normal do Gmail; não envie a senha pelo chat, pelo Git ou em arquivos de documentação. Ela não é uma variável `VITE_*` nem deve ser configurada na Vercel.
5. Confirme a entrega de um cadastro e de uma recuperação de senha em uma caixa de e-mail controlada pelo proprietário, usando o aplicativo. Verifique também os links e o retorno ao aplicativo. Essa validação permanece pendente.

O Google exige verificação em duas etapas para senhas de app. A opção pode não aparecer em contas com Proteção Avançada, contas de organização ou com verificação configurada somente por chaves de segurança. Nesse caso, escolher outro provedor SMTP antes de alterar a configuração. [Requisitos oficiais](https://support.google.com/accounts/answer/185833?hl=pt-BR).

O Gmail impõe limites e pode suspender temporariamente o envio; a documentação cita mais de 500 mensagens por dia como um dos motivos para bloqueio. Isso não é uma garantia de capacidade ou entrega. Para volume maior, substituir por um serviço de e-mails transacionais. [Limites Gmail](https://support.google.com/mail/answer/22839?hl=pt-BR). Host e portas foram conferidos na [documentação SMTP do Google](https://developers.google.com/workspace/gmail/imap/imap-smtp).

O SMTP padrão do Supabase só envia a endereços da equipe e tem limite baixo. SMTP próprio é necessário para os clientes externos. A confirmação de e-mail continua ativa; não desativá-la para contornar a falta de SMTP. [Documentação Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

Depois de salvar SMTP no painel, preservar esses valores ao sincronizar `config.toml` pelo CLI: não executar um push de configuração antiga que desative ou sobrescreva o SMTP. Nunca imprimir a senha durante comparação de configurações.
