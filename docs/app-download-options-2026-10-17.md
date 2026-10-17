# Downloads dos outros aplicativos após instalar um perfil

Relato: depois de instalar um aplicativo, as opções de baixar os demais desapareciam. O componente compartilhado mostrava somente o perfil da página e retornava `null` ao detectar esse aplicativo instalado. Faltavam acessos aos demais perfis nesse bloco.

A apresentação agora esconde somente o botão de instalar o perfil atual. Os outros dois aplicativos continuam acessíveis por links com seus próprios ícones, cores e endereços de instalação. Os links abrem uma nova janela/aba para permitir continuar no navegador do celular. Cada página continua usando exclusivamente seu próprio manifesto e oferta nativa de instalação.

Os acessos dos outros perfis permanecem disponíveis mesmo se o app atual estiver instalado: a instalação em uma origem não comprova a instalação nas outras. Não foram alterados IDs, manifestos, permissões, contas, dados ou configuração do backend.

## Verificação

- O teste com React real reproduziu a ausência dos dois links e passou após a correção. Cobre cliente, estabelecimento e entregador, antes e depois de instalar o perfil atual, links nas origens corretas e abertura segura em nova aba.
- A verificação HTTP da publicação anterior também reproduziu a ausência desses acessos. Os verificadores HTTP agora exigem os dois links no HTML de cada perfil.
- 158 testes passaram. Lint sem avisos e TypeScript aprovados. Build Node e HTTP local aprovados nos três perfis, incluindo os links dos outros aplicativos no HTML real.
- Revisão independente sem defeitos concretos no escopo corrigido.
- A instalação física dos três apps lado a lado e a abertura no Chrome do celular ainda precisam de confirmação em um aparelho real. Não há navegador compartilhado conectado nesta sessão.

Entradas diretas:

- Cliente: https://pedetrem.vercel.app/cliente/entrar
- Estabelecimento: https://pedetrem-loja.vercel.app/estabelecimento/entrar
- Entregador: https://pedetrem-entregador.vercel.app/entregador/entrar
