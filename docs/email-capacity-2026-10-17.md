# Capacidade de confirmação de e-mail

Pedido do proprietário: investigar confirmação de Estabelecimento/Entregador e retirar os limites controlados pelo aplicativo.

## Estado consultado

Em 17/10/2026 a API autenticada da Brevo informou plano `free`, 296 envios disponíveis, relay ativo e quatro solicitações no dia: três entregas, uma devolução temporária. Não havia eventos de bloqueio ou adiamento por cota. A devolução do Entregador continua identificada como domínio destinatário `gmail.coml` sem MX. Os dois cadastros recentes de Estabelecimento possuem entrega registrada; um possui confirmação no Auth.

Isso não prova a causa de uma nova tentativa do proprietário: o e-mail usado e a mensagem exibida foram solicitados para correlação. A consulta ao log Auth pela Management API retornou erro do backend; `auth.audit_log_entries` não retornou registros no período. Não foi afirmado que essas tentativas novas tiveram entrega confirmada.

## Configuração aplicada

Somente no projeto Supabase wifome `nsvgfagjezdduatmbsqq`, PATCH específico seguido de releitura:

| Campo                   | Antes       | Depois          |
| ----------------------- | ----------- | --------------- |
| `rate_limit_email_sent` | 30 por hora | 10.000 por hora |
| `smtp_max_frequency`    | 60 segundos | 0 segundos      |

O limite por hora foi ampliado, não transformado em infinito. No limitador do Auth, zero eventos não significa capacidade infinita: pode bloquear todos os eventos. O intervalo de envio por destinatário, em contrapartida, foi zerado conforme sua implementação de frequência.

A comparação de todas as chaves da configuração confirmou alteração somente desses dois campos. Confirmação obrigatória, URLs, hook assinado, credenciais, demais limites de autenticação e sessões ficaram preservados. Não usar `config push` com configuração incompleta para repetir esse ajuste.

## Interface

Removidos estado/timer e bloqueio fixo de 60 segundos do reenvio de confirmação, inclusive logo após cadastro. O botão continua impedindo uma segunda chamada enquanto a primeira está em andamento; concluída a chamada, outra solicitação manual pode ser feita imediatamente. Não há repetição automática. Respostas de erro do provedor continuam sendo apresentadas sem fingir sucesso.

## Limite do provedor

A Brevo gratuita permite 300 envios por dia. Essa cota não foi alterada, e nenhum plano foi contratado. Eliminar a cota diária exige uma contratação adequada com o provedor; o aplicativo não consegue removê-la. Com o teto atual do Supabase, o limite de 30 por hora deixa de restringir o uso dessa cota.

Os três aplicativos compartilham a mesma identidade de acesso. Um e-mail já confirmado pode entrar em outro perfil com a mesma senha; repetir cadastro não cria outra conta e pode não gerar nova confirmação. O fluxo não deve usar uma resposta de cadastro para revelar publicamente a existência de uma conta.

Referências: [Supabase Auth Rate Limits](https://supabase.com/docs/guides/auth/rate-limits), [limites do plano Brevo grátis](https://help.brevo.com/hc/pt/articles/208580669-FAQ-Quais-s%C3%A3o-os-limites-do-plano-Gr%C3%A1tis), [limitador do Auth](https://github.com/supabase/auth/blob/master/internal/ratelimit/interval.go), [frequência de envio](https://github.com/supabase/auth/blob/master/internal/api/mail.go).

## Validação

223 testes passaram, incluindo os handlers reais de cadastro/reenvio dos três perfis. O teste de regressão falhou com o bloqueio antigo e passou após sua remoção. TypeScript, ESLint e build para Vercel passaram. A inspeção de 478 entradas do deploy e 313 arquivos públicos não encontrou arquivos privados nem valores de credenciais do servidor.

Essas verificações não substituem a confirmação de entrega de uma nova tentativa na caixa de entrada do destinatário. Nenhum e-mail real adicional foi disparado durante este ajuste de capacidade.
