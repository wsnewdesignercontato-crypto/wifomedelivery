# PedeTrem: aplicativos por perfil e correções da auditoria

## Comportamento

- Cliente vermelho, estabelecimento laranja e entregador verde, com nomes, ícones, manifests e IDs de instalação distintos. IDs existentes preservados para atualizar instalações anteriores.
- Banner superior de instalação por perfil. Usa execução standalone, eventos reais de instalação e `getInstalledRelatedApps` quando disponível. Não considera flags antigas como prova de instalação.
- Cliente pode visitar início, busca, novidades e cardápios sem cadastro. Pedir exige login e retorna ao mesmo cardápio. Loja, entregador, dados pessoais e administração continuam protegidos.
- Cadastro incompleto não bloqueia a navegação do cliente. Confirmar pedido exige telefone com DDD e endereço cadastrado, tanto na tela quanto no banco. Os formulários voltam à finalização, mantendo o cupom.
- Sessão local que ainda contém JWT de usuário removido não pode provocar um ciclo entre login e `/app`. Verifica o usuário antes do encaminhamento e limpa somente a sessão local inválida.

## Correções integradas

As mudanças preservam a publicação anterior `25323f9`, incluindo e-mails com a marca, políticas públicas e espaço de equipe. O histórico publicado e as migrations anteriores não foram reescritos.

- Colunas bancárias e código de entrega protegidos; código separado da linha de pedido replicada em Realtime; RPCs por participante e chat/arquivos por conversa.
- Checkout transacional com catálogo autorizado, complementos obrigatórios, estoque agregado, área de entrega, cupom, total conferido e repetição idempotente.
- RPCs anteriores continuam disponíveis durante a atualização, sujeitos às mesmas restrições de manutenção, entrega e contato. Cancelamento restitui estoque e cupom uma vez. Exclusão de produto preserva o recibo.
- Cupom da loja custeado pela loja, cupom global pela plataforma; classificação histórica preservada. Créditos pendentes até conferência manual pelo admin, com registro de recebimento e estorno manual. Nenhum desses registros transfere dinheiro.
- Saldo considera o histórico completo e solicitações reservadas. Saques têm chave persistente por tentativa e proteção contra concorrência e repetição após perda da resposta.
- Ticket e primeira mensagem atômicos, conversa por titular/admin, contatos configuráveis, busca administrativa antes da paginação e preferências efetivas do dispositivo.

## Evidências antes da publicação

- 121 testes unitários aprovados; TypeScript e lint completo sem erros ou avisos.
- PostgreSQL isolado: replay do baseline publicado e das quatro migrations novas, seis contratos transacionais e seis cenários de concorrência real em sessões separadas.
- Regressões: manutenção/cidade/zona no checkout legado; financiamento de cupom antigo; item adicionado em outra aba durante checkout preservado; mesma chave de saque mesmo com saldo para dois pedidos.
- REST autenticado: projeções e RPCs legítimas funcionam; banco/código negados ao papel indevido; evento Realtime real sem código privado.
- Navegador local: visitante abriu cardápio, ação de pedir abriu login e retornou ao cardápio; cliente sem dados pôde navegar; modal identificou telefone/endereço, formulários voltaram ao checkout e compra fictícia de R$29 foi concluída sem modal após preenchimento.
- Build Node aprovado. Build Vercel output v3 aprovado; 432 entradas de deploy verificadas e 300 arquivos públicos examinados sem valores reais das credenciais privadas.
- Registro oficial npm: zero avisos nas 448 dependências consultadas do lockfile.
- Supabase real: ensaio das quatro migrations e seis contratos em transação revertida; 84 migrations, um usuário e zero pedidos reais preservados.
- Revisão independente confirmou as correções de compatibilidade, financiamento legado e exclusão seletiva de itens comprados.

## Limites e observações operacionais

- Não há teste físico de coinstalação/desinstalação em Android/iPhone. Navegadores sem API de detecção não informam com segurança a desinstalação; abrir pelo ícone instalado reconhece o perfil em execução. O site não pode prometer a mesma detecção em todos os navegadores.
- Saques, recebimento e estorno são registros/conferências manuais; não há adquirente ou transferência bancária automática integrada.
- A configuração Brevo existente foi consultada como configurada e testada, remetente PedeTrem. Esta entrega preserva essa configuração e os templates; não enviou e-mail real novo.
- O advisor mantém avisos de RPCs `SECURITY DEFINER` deliberadamente expostas e verificadas por identidade/papel; a projeção histórica `public_reviews` é pública e limitada a avaliações de lojas aprovadas, sem identificadores de cliente/entregador ou descrição privada de problemas. O advisor a classifica como view definer. Não alterar para invoker sem substituir a projeção pública: isso interromperia as avaliações para visitantes.
- `rls_auto_enable` é um event trigger gerenciado do Supabase; sua configuração foi preservada. Proteção de senhas vazadas continua indicada pelo advisor como desativada. Não há alegação de zero avisos do advisor.

## Publicação

Destino autorizado: projeto Vercel `wifomedelivery`, conta WS, domínio `https://pedetrem.vercel.app`, Supabase `nsvgfagjezdduatmbsqq`.

As migrations `20261016025220`, `20261016025222`, `20261016025223`, `20261016025225` foram aplicadas em uma transação. Histórico com 88 entradas, um usuário, zero pedidos reais e o proprietário admin preservados.

Versão de aplicação validada: `e1b3a63819b09ffe5d5f765d305777d63ea8043d`. Deployment `dpl_DyT4vCse15HCBEpd1RqrnK6zkvwV`, estado READY, promovido ao domínio canônico em 16/10/2026 03:27 UTC. Treze endpoints HTTP passaram, assim como os três manifests e os bytes exatos de seus ícones. A consulta de erros da produção retornou zero registros no período verificado.

No navegador de produção, em viewport de celular, o cliente abriu o catálogo como visitante; loja e entregador abriram seus logins, com banner, marca e cor correspondentes e sem opção de visitante. Não foram criados pedidos ou usuários reais nesses testes. REST público confirmou a leitura do catálogo e negou colunas bancárias, pedidos e criação de checkout anônimo.

O registro desta publicação altera apenas documentação após o commit da aplicação validado acima. Evidências detalhadas e capturas ficam em arquivos locais ignorados; credenciais não integram o repositório.
