# Confirmação de e-mail e dados do Cliente

## Diagnóstico verificado

Consulta somente leitura no Supabase wifome `nsvgfagjezdduatmbsqq` e nos eventos transacionais da Brevo em 17/10/2026:

- Confirmação ativa e Send Email Hook ativo. As três origens estão permitidas tanto no Supabase quanto no gerador de e-mails do aplicativo.
- Os dois cadastros recentes de Estabelecimento possuem evento `delivered`; um deles também possui abertura/clique e confirmação no Auth. Entrega no servidor destinatário não prova a pasta da caixa de entrada.
- O cadastro recente de Entrega possui solicitação aceita pela Brevo e `softBounces`, motivo `Unable to find MX of domain gmail.coml`. O domínio do destinatário foi digitado incorretamente; não foi falha de roteamento entre os aplicativos.
- Nenhuma conta real foi alterada, confirmada manualmente ou excluída. Não foram disparados novos e-mails durante a investigação. Eventos completos e credenciais ficaram apenas nos arquivos privados ignorados.

## Alterações no acesso

- Validação de erros comuns nos domínios conhecidos, incluindo o `gmail.coml` observado, antes de cadastro, acesso, recuperação ou reenvio. Não há correção automática do endereço de uma pessoa.
- Tela de confirmação com **Reenviar confirmação**, espera de 60 segundos, bloqueio de clique duplicado e erros tratados. O botão só faz uma solicitação por ação; não há reenvio automático.
- Acesso com e-mail ainda não confirmado leva à mesma tela, permitindo reenviar sem repetir o cadastro.
- Cadastro e reenvio compartilham o gerador de URL: preserva origem do aplicativo, perfil e retorno local seguro. A API Auth continua verificando a confirmação; o frontend não concede acesso.
- Orientação para usar a mesma conta PedeTrem nos três aplicativos. A mensagem de confirmação não afirma que um novo e-mail foi entregue quando o Auth protege a existência de uma conta já cadastrada.
- Quem digitou um destinatário incorreto pode voltar e refazer o cadastro com o endereço correto. Isso não transfere a conta incorreta para outro e-mail nem altera seus dados silenciosamente.

## Alterações no Cliente

Reproduções executaram os handlers reais dos componentes, substituindo somente ciclo React e fronteiras externas:

- Atualização de perfil com zero linhas era aceita como sucesso. Agora o salvamento exige a linha retornada pelo banco e, no retorno ao checkout, um telefone válido nessa linha.
- Leituras de perfil/endereços com erro ou perfil inexistente podiam deixar uma tela sem ação útil. Agora há erro visível e nova tentativa.
- Checkout aberto não relia contato/endereço após alterações. Agora recarrega ao salvar e ao recuperar foco, preserva o endereço selecionado quando ainda existe e descarta respostas antigas ou de tela desmontada.
- O aviso identifica somente o dado que ainda falta. Com telefone já salvo e endereço ausente, solicita apenas o endereço, sem repetir a cobrança do telefone.

As políticas remotas de `profiles` e `addresses` permitem acesso somente ao proprietário e foram consultadas. Não foi encontrada evidência de RLS como causa do relato. O Cliente já estava sem bloqueio geral de onboarding no código publicado; a exigência de telefone/endereço continua limitada à compra. Não se exige CPF/RG para navegar como Cliente.

Nenhuma migração, regra financeira, pedido, sessão real ou papel de usuário foi alterado neste ajuste.

## Limites de validação

220 testes automatizados após integração com a main, TypeScript, lint sem avisos e revisão independente aprovados. Uma conta temporária isolada também exercitou a API de produção com autenticação de proprietário: atualização retornou uma linha, nova leitura preservou o telefone e endereço inserido foi relido. A conta temporária foi excluída e as contagens originais de usuários, perfis e endereços foram conferidas; nenhum e-mail foi disparado por esse teste.

Testes cobrem os handlers, transporte Supabase real com resposta controlada, retorno dos três perfis e dados persistidos/atualizados. Isso não substitui observar a sessão real do usuário nem comprova a chegada de um novo e-mail na caixa de entrada. O destinatário com `gmail.coml` precisa ser corrigido pelo proprietário no cadastro.
