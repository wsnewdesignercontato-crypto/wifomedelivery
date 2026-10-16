# Instalações independentes e ícones completos

## Problema reproduzido

`node scripts/check-pwa-http.mjs https://pedetrem.vercel.app` falhou na versão anterior: o HTML inicial de `/auth?perfil=estabelecimento` continha `/manifest.webmanifest`, o manifesto do cliente. O código corrigia o link apenas depois da hidratação. Isso podia vincular a oferta/pacote de instalação ao aplicativo errado. As três aplicações também compartilhavam escopo `/`, e os ícones transparentes declaravam apenas a finalidade comum.

## Comportamento corrigido

| Aplicativo      | Entrada para instalar/entrar | Escopo             | ID preservado             |
| --------------- | ---------------------------- | ------------------ | ------------------------- |
| Cliente         | `/cliente/entrar`            | `/cliente`         | `/wifome-cliente`         |
| Estabelecimento | `/estabelecimento/entrar`    | `/estabelecimento` | `/wifome-estabelecimento` |
| Entregador      | `/entregador/entrar`         | `/entregador`      | `/wifome-entregador`      |

O HTML inicial fornece manifesto, ícone Apple e cor corretos para a requisição. O prompt pertence ao documento originalmente carregado, impedindo que uma navegação React reaproveite a instalação de outro perfil. Links de perfil na página inicial fazem navegação completa. O botão de instalação recarrega uma entrada própria quando necessário e oferece instruções para abrir no navegador, fora de outro PWA já instalado.

Os formulários existentes foram extraídos para `AuthScreen`, sem trocar as regras de cadastro, senha, confirmação de e-mail ou retorno à compra. Somente os três caminhos exatos de login são públicos. Loja, entregador, pedidos e dados pessoais continuam exigindo autenticação; o cliente mantém o catálogo visitante e exige telefone/endereço ao comprar. `/auth` permanece compatível, preservando parâmetros e hash ao encaminhar ao perfil. Não houve alteração de banco ou da configuração Brevo.

O retorno `?confirmado=1` também foi corrigido: o parser do TanStack converte esse valor em número, e o schema antigo exigia string, provocando erro HTTP500. O novo schema normaliza somente esse sinal conhecido e preserva o retorno; os testes usam o parser real e o HTML servido para reproduzir o caso.

As notificações procuram uma janela do próprio perfil, em vez de navegar a primeira janela da mesma origem.

## Artes e arquivos

Novas artes geradas com a ferramenta integrada `imagegen`, preservando a marca PedeTrem. Fontes guardadas em `docs/assets/pwa-icons/pedetrem-{perfil}-v2.png` e `pedetrem-{perfil}-maskable-v2.png`, com os perfis `cliente`, `estabelecimento`, `entregador`. O cliente foi redesenhado na mesma família das outras cores.

Prompt da arte: preservar o símbolo branco de sacola/P/localização e a palavra exata PedeTrem; fundo vermelho, laranja ou verde opaco de ponta a ponta; sem disco, moldura, margem branca ou transparência. Prompt da versão adaptável: reduzir o grupo da marca a 75% do tamanho da arte anterior, centralizar e manter todos os elementos importantes na área segura circular, conservando o fundo colorido em todos os pixels.

Exportações PNG RGB para cada perfil:

- `public/icons/{perfil}-any-512-v2.png` e `-any-192-v2.png`: logo no app e ícones comuns.
- `public/icons/{perfil}-maskable-512-v2.png`: composição para recorte adaptável no Android.
- `public/icons/{perfil}-apple-v2.png`: 180×180, opaco, para a tela inicial Apple.

Arquivos antigos foram preservados para referências/instalações anteriores. As fontes de alta resolução não entram no upload Vercel; as exportações prontas são publicadas com o aplicativo.

## Verificação

Os testes focados cobrem escopos separados, IDs estáveis, destinos dentro do escopo, dimensões reais de PNG, todos os pixels opacos e ausência de borda branca nas arestas. Testam também a identidade imutável do documento ao mudar de perfil e a escolha da janela correta em notificações.

`scripts/check-pwa-http.mjs` consulta o HTML antes de JavaScript, segue os links antigos, verifica os parâmetros de retorno de confirmação, os manifests e o conteúdo/dimensões dos ícones comuns, adaptáveis, Apple e favicon. Deve passar tanto no build local como no endereço publicado.

Limite: a coinstalação física em Android/iPhone e a atualização de ícones já instalados precisam ser confirmadas no aparelho. O navegador compartilhado não estava conectado nesta etapa; as validações executadas foram de HTTP, código, pixels e build, com revisão independente. Não se declara uma instalação física que não foi observada.

Instalações antigas podem manter o ícone anterior no cache do sistema até a atualização. Para receber a nova arte imediatamente, reinstalar pelo link específico do perfil no navegador do celular.

Referências oficiais: [identidade PWA](https://developer.chrome.com/docs/capabilities/pwa-manifest-id), [ícones adaptáveis](https://web.dev/articles/maskable-icon) e [instalação por sistema](https://web.dev/learn/pwa/installation).

## Publicação verificada

Código publicado: `c855b63d8737fb42637e8b3964824459db82545d`. Deployment de produção `dpl_EwAqDQF6eiF3ZvCLATZ6nL7xCC7C`, promovido para <https://pedetrem.vercel.app> na conta `wsnewdesignercontato-6856`, projeto `wifomedelivery`. Confirmação do domínio e commit em 2026-10-16 às 19:44 UTC; build remoto em 30 segundos.

Validação: 130 testes unitários aprovados, lint sem avisos, TypeScript e builds Node/Vercel aprovados. O deployment preparado passou em 18 consultas autenticadas de HTML/manifests/ícones antes da promoção. Depois da promoção, `node scripts/check-pwa-http.mjs https://pedetrem.vercel.app` passou para cliente, estabelecimento e entregador, incluindo o retorno `confirmado=1`. Consulta dos logs de erro desse deployment nos últimos 15 minutos: zero entradas no momento da verificação.

Foram conferidos 451 arquivos de upload, sem arquivos privados, e 316 arquivos públicos contra os segredos efetivos do projeto, sem exposição encontrada. Esta etapa não alterou banco nem a configuração de envio de e-mails. Os limites de instalação física e atualização de ícones antigos descritos acima permanecem.

## Correção da sobreposição no cabeçalho

Um print enviado pelo proprietário mostrou a faixa de instalação e o cabeçalho da página inicial sobrepostos. A faixa é renderizada antes do `Outlet` no contêiner relativo da raiz. Como a página inicial não estabelecia seu próprio bloco de referência, o cabeçalho absoluto com `top:0` se posicionava no topo desse contêiner, sobre a faixa.

A correção adiciona `position:relative` ao contêiner da página inicial. O cabeçalho passa a se posicionar dentro da página, depois da faixa, acompanhando a altura real dela sem deslocamentos fixos. Quando a faixa é ocultada, a página e seu cabeçalho retornam juntos ao topo. Não altera manifests, identidades de instalação, autenticação nem banco.

Verificação antes da publicação: 130 testes aprovados, lint sem avisos, TypeScript e build Node aprovados. Não foi criado um teste que apenas repita a classe CSS. O print e a árvore de componentes fundamentam o diagnóstico; a confirmação visual após a correção permanece pendente. A ferramenta de controle do Chrome interrompeu a inspeção porque não conseguiu determinar com segurança a URL atual, e não foram tentadas outras formas de automação do navegador após o bloqueio.
