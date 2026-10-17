# Clique de instalação do Entregador

## Falha reproduzida

Na versão `d1c2723`, Android/Chrome sem uma oferta `beforeinstallprompt` entrava em `preparing`: a barra ficava desabilitada por 45 segundos. Nenhuma transferência ou instalação era iniciada nesse intervalo. Ao terminar, só aparecia uma mensagem para tentar novamente. O diálogo de ajuda era explicitamente excluído no Android.

A reprodução usou os componentes React reais em DOM simulado com URL/manifest do Entregador e identificação Android/Chrome. O teste falhou porque o clique não abriu nenhuma alternativa de instalação. Isso identifica um defeito concreto do código; não comprova que foi exatamente o estado no aparelho do proprietário.

## Correção

- Sem oferta nativa, o clique abre imediatamente as opções de instalação do perfil atual, incluindo menu do Chrome → Instalar aplicativo/Adicionar à tela inicial. Não bloqueia por uma preparação que não executa nenhuma instalação.
- A barra distingue **Como instalar** de **Instalar**, conforme exista uma oferta nativa. Em navegador embutido, a ação de abrir o perfil correto no Chrome permanece disponível.
- Uma oferta nativa disponível é consumida uma vez e acionada diretamente pelo clique. Se chegar depois de abrir a ajuda, permite **Instalar agora** com um novo clique, preservando a exigência de gesto do usuário.
- Falha ao abrir a janela também oferece ajuda. O convite aparece uma vez por visita; receber a oferta depois não repete o convite dispensado.
- Origens, manifests, IDs, ícones, permissões e autenticação não foram modificados. Nenhum clique ou aceitação de oferta é registrado como instalação concluída.

## Evidências e limites

O HTTP publicado dos três aplicativos passou: origem independente, manifest inicial único, ícones e worker disponíveis. No Chrome desktop real, a tela do Entregador recebeu a oferta nativa; o clique entrou no estado de confirmação do navegador sem erro JavaScript observado. O teste foi encerrado sem instalar software no computador. Isso não é validação de um Android.

Após a correção, o componente React em DOM simulado passou nos três caminhos do Entregador/Android: ajuda imediata sem oferta, chamada nativa única com oferta e convite automático junto à barra. Testes permanentes cobrem a chegada tardia da oferta e a ausência de confirmação falsa por simples aceitação.

A instalação e a permanência dos três aplicativos no mesmo celular ainda exigem observação em aparelho físico. O site depende da disponibilização da API pelo Chrome para abrir a janela programaticamente; o menu do navegador é uma alternativa real quando a oferta não está disponível. Não se alterou worker/cache nem se atribuiu o problema à identidade dos aplicativos sem evidência.

Referências: [Critérios de instalação do Chrome](https://web.dev/articles/install-criteria), [gesto do usuário e oferta de uso único](https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent/prompt).
