# Persistência do cadastro do entregador

Os formulários de dados pessoais e pagamento enviam apenas os campos editados para `save_courier_registration`. O servidor identifica a conta pela sessão, valida uma lista explícita de campos e grava `profiles` e `courier_profiles` na mesma transação. A resposta contém os registros confirmados e o resultado atualizado das pendências cadastrais.

Telefone e CNH não são substituídos por recargas em segundo plano enquanto o formulário está em edição. Consultas anteriores são canceladas antes de atualizar o cache com o resultado salvo. Falhas de leitura mostram uma opção de tentar novamente e não são interpretadas como cadastro vazio. Falhas de gravação mantêm os campos digitados e não exibem sucesso.

Cada campo enviado inclui o valor que o formulário havia carregado. Se outra tela alterar esse mesmo campo, o servidor rejeita a substituição por uma versão antiga. Campos não editados, incluindo dados bancários, permanecem intactos. Aprovação, KYC, pontuação, disponibilidade e identificação de outra conta nunca são aceitos por esse comando.

Documentos e veículos só mostram sucesso após a devolução de uma linha persistida. As listas mantêm o conteúdo anterior quando a leitura falha e descartam respostas atrasadas. A troca de veículo ativo usa uma única transação: se falhar, o veículo anterior continua ativo.

Verificações:

- `tests/courier-registration-form.test.mjs`: edição de telefone/CNH durante recarga, sucesso confirmado, falha mantendo rascunho, nova montagem lendo os dados salvos e proteção dos campos não editados.
- `tests/courier-registration-sql.test.mjs`: persistência, conflitos e reversão de gravação parcial em Postgres de teste.
- `supabase/tests/courier-registration.sql`, com as fixtures de `order-acceptance-flow.sql`: conta comum, leitura após retornar, permissão por conta, preservação de aprovação/status, falha injetada entre as gravações, documento e troca de veículo com reversão. Executado no esquema completo com ROLLBACK; cadastros reais não são alterados pelo teste.

Se a conexão cair depois da gravação, repetir a mesma alteração com os valores já persistidos é aceito. Uma alteração concorrente diferente continua protegida contra substituição por um formulário antigo.
