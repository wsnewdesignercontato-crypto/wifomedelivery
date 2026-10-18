# Dados salvos ao retomar o aplicativo

## Problemas reproduzidos e correção

O formulário de endereço salvava no banco e apresentava o endereço na lista, mas o cabeçalho continuava com “Escolher endereço”. O cabeçalho só recarregava ao montar ou receber alterações do carrinho. Agora observa os eventos de dados/perfil salvos, alterações dos próprios endereços em Realtime e a retomada da página.

O checkout relia o contato em `focus` e na notificação de perfil salvo, mas não em `visibilitychange`, `pageshow` ou `online`. Esses eventos agora também provocam a releitura do telefone e dos endereços persistidos. O formulário continua exigindo os dados para concluir a compra; um telefone já salvo não deve ser solicitado quando falta somente endereço.

Respostas antigas são descartadas por sequência e desmontagem. O resumo do cabeçalho pertence explicitamente a um usuário: uma troca de identidade apresenta valores vazios até a leitura correspondente, sem aproveitar endereço/carrinho da conta anterior. Uma falha de rede preserva o último valor apenas para a mesma identidade.

## Evidência e limites

Antes da alteração, cinco testes falharam reproduzindo a falta de atualização do cabeçalho e de releitura do checkout ao retomar a página. Um teste adicional reproduziu o risco de apresentar o endereço anterior durante troca de usuário com erro de rede. Todos passaram após as correções.

No site publicado, uma conta temporária cadastrou telefone pelo formulário real. A leitura administrativa confirmou 11 dígitos persistidos, e o formulário manteve o telefone após recarregar. O endereço também foi confirmado no banco e na lista. Essa primeira navegação apresentou um erro intermitente de permissão no perfil, não reproduzido na leitura autenticada direta nem na entrada seguinte; sua causa não foi atribuída à gravação do telefone. Nenhuma permissão do banco foi ampliada por este ajuste.

Os testes executam os handlers/componentes reais com fronteiras externas controladas. Os cenários de retomada simulam os eventos do navegador; não constituem teste físico de instalação Android/iPhone.

## E-mails

A consulta atual ao Supabase confirmou confirmação obrigatória, hook de envio ativo, retornos de confirmação/recuperação permitidos nos três aplicativos e aviso de senha alterada já habilitado. Nenhuma configuração Auth foi alterada nesta etapa.

Dois testes adicionais exercitam o handler real de recuperação: destinatários distintos nos três perfis, retorno ao aplicativo correspondente e erro sem apresentar sucesso quando o pedido é recusado. Não enviam mensagens reais.

Os registros da Brevo consultados têm entregas de Estabelecimento e uma falha anterior de Entregador com domínio `gmail.coml`. Faltam os destinatários das tentativas relatadas para correlacionar novas falhas; não se afirma que a entrega dessas tentativas foi corrigida ou confirmada. O limite do plano Brevo continua sendo responsabilidade do provedor.
