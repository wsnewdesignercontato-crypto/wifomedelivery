# Cadastro repetido nos aplicativos com o mesmo e-mail

## Causa reproduzida

O proprietário esclareceu que tentou cadastrar nos aplicativos de Estabelecimento e Entregador o mesmo e-mail já confirmado no Cliente.

Com uma conta temporária confirmada no projeto wifome, duas solicitações públicas de cadastro reproduziram a resposta ofuscada do Supabase: HTTP 200, identidades vazias e nenhuma sessão. A senha original continuou funcionando e o perfil inicial não foi alterado. A interface tratava essa resposta como cadastro novo pendente de confirmação, deixando a pessoa aguardando outro e-mail.

## Correção

Uma resposta sem sessão e com identidades explicitamente vazias agora oferece acesso à conta, recuperação de senha ou cadastro com outro e-mail. O erro público `user_already_exists` recebe a mesma orientação. A mensagem é condicional e não afirma que uma conta existe com base em consulta administrativa.

O botão “Entrar com minha conta” abre o login com o e-mail preenchido. A pessoa precisa autenticar com a senha existente. “Esqueci minha senha” mantém o e-mail e o aplicativo de retorno. Os demais erros continuam visíveis; cadastros novos e contas ainda não confirmadas continuam no fluxo de confirmação.

Nenhuma resposta ofuscada é usada para obter identidade, criar sessão ou ativar um perfil. Não há login, reenvio de confirmação ou recuperação automáticos. A ativação de perfil continua passando pela autenticação real e pelas regras já existentes. Não foram alterados senhas reais, confirmação obrigatória, banco, RLS ou a identidade dos aplicativos instaláveis.

## Verificação

Três testes de regressão falharam antes da correção e passaram depois: resposta ofuscada, erro explícito de cadastro repetido e acesso à recuperação no contexto escolhido. Os oito testes de handlers de autenticação passaram, incluindo cadastro novo, reenvio e recuperação nos três aplicativos.

Referência: [cadastro de usuários no Supabase](https://supabase.com/docs/reference/javascript/auth-signup).
