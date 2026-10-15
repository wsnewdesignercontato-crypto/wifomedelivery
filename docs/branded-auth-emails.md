# E-mails de autenticação PedeTrem — 15/10/2026

## Publicação

Modelos em português, com a logo oficial servida pelo domínio do aplicativo, identidade vermelha e branca, botão de ação, link alternativo, orientação de segurança e versão texto. Layout conferido em navegador com viewport de 390 e 720 pixels, sem rolagem horizontal. Compatibilidade com todos os clientes de e-mail não foi medida.

A produção https://pedetrem.vercel.app passou a usar o Send Email Hook https://pedetrem.vercel.app/api/auth/send-email e a chave Brevo já criptografada no Vault. O remetente salvo é PedeTrem / contatopedetremdelivery@gmail.com; a consulta autenticada à API Brevo confirmou esse remetente ativo. Nenhuma chave foi adicionada ao Git ou ao frontend.

Tipos cobertos: signup, recovery, email_change, reauthentication, invite, magiclink, password_changed_notification e email_changed_notification. Confirmação de cadastro e dupla confirmação da troca de e-mail estão habilitadas. Os avisos após mudança de senha e e-mail também foram ativados. O aviso de e-mail alterado vai para o endereço anterior informado pelo Auth, sem usar metadados editáveis pelo usuário. As notificações informativas não inventam links de confirmação.

Após o deploy automático da main, a releitura mostrou a Site URL efetiva https://wifomedelivery-wsnewdesignercontato-6856.vercel.app/. Esse alias de produção e https://pedetrem.vercel.app são do mesmo projeto e estão permitidos. O aplicativo informa o retorno explicitamente para o domínio em uso. As URLs de retorno anteriores foram preservadas. O servidor aceita as origens exatas dos três aliases de produção já pertencentes ao projeto e do deployment atual. Links com token continuam passando pela verificação do Supabase antes do retorno ao app.

Variáveis privadas na produção Vercel: AUTH_EMAIL_HOOK_SECRET e AUTH_EMAIL_HOOK_ENABLED=true. O segredo também está configurado no Supabase. O GET de configuração mascara esse segredo; ele não deve ser impresso nem tratado como uma chave comparável em texto puro. As chamadas HTTP verificam assinatura Standard Webhooks e timestamp. A deduplicação existente foi preservada.

## Verificações

- 84 testes locais, typecheck e lint sem avisos aprovados; build Vercel concluído.
- 15 verificações HTTP públicas aprovadas após a promoção.
- Seis eventos assinados (cadastro, recuperação, mudança de e-mail, reautenticação e dois avisos) responderam 200 no deployment validado. O teste usou recibos sintéticos já marcados como processados, evitando envios. Os sete recibos temporários foram removidos e a limpeza conferida.
- Chave/remetente previamente testados no aplicativo; API Brevo consultada novamente em modo somente leitura, remetente ativo.
- Configuração Auth relida após a ativação: hook, confirmação, dupla confirmação e ambos os avisos habilitados. Patch final limitado a oito campos, sem outras diferenças de configuração.
- Não foi disparado novo e-mail real nem validada a chegada à caixa de entrada nesta alteração. O teste sintético comprova a rota assinada e a deduplicação, não a entrega pelo provedor. Também não cria usuários ou altera senhas reais.

## Observação operacional

O primeiro comando de configuração do CLI aplicou defaults de URL, TOTP e limites além do pretendido e recebeu recusa ao tentar ativar armazenamento vetorial pago. Os valores anteriores foram restaurados e conferidos; nenhum plano foi contratado. A ativação final usou PATCH específico da API oficial, preservando as demais configurações. Não repetir config push com um config.toml incompleto em produção.

Para futuras revisões, manter confirmação habilitada, preservar o segredo privado e publicar o endpoint antes de habilitar o hook. Não trocar o transporte para SMTP enquanto o hook estiver ativo. Não reenviar mensagens sem uma solicitação do usuário ou ação explícita de teste pelo administrador.
