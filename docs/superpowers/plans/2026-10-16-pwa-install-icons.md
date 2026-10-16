# Corrigir instalação independente e ícones sem borda

Pedido do proprietário: refazer o logo do cliente, preencher o ícone no celular sem borda branca e corrigir a instalação dos três aplicativos.

## Diagnóstico

O HTML inicial apontava sempre ao manifesto padrão do cliente. A troca para loja/entregador ocorria somente em efeito React, depois da leitura inicial do navegador. Os três escopos eram `/`, e os logins compartilhavam `/auth`. Os PNGs eram transparentes e o manifesto declarava somente `purpose:any`, sem ícones adaptáveis.

## Correção autorizada

- [x] Preservar domínio, banco e IDs instalados; separar escopos `/cliente`, `/estabelecimento`, `/entregador` e logins públicos dentro de cada escopo.
- [x] Reutilizar exatamente o formulário de autenticação existente; manter `/auth` compatível e preservar parâmetros/retornos de e-mail.
- [x] Renderizar manifesto, título Apple, ícone e cor correspondentes no HTML inicial. Não reutilizar prompt de instalação carregado para outro perfil.
- [x] Gerar artes opacas com fundo colorido de ponta a ponta e marca dentro da área segura; exportar tamanhos próprios de instalação e declarar ícones maskable, comuns e Apple.
- [x] Testar HTML antes de JavaScript, escopos/destinos, pixels opacos, registro de prompts por perfil e navegação/login, além de regressões, lint, TypeScript e build.
- [ ] Publicar na conta WS e verificar manifests, arquivos e telas reais. Informar os limites de teste físico de Android/iPhone sem alegar coinstalação observada se não houver dispositivo disponível.

Referências oficiais: [identidade do manifesto](https://developer.chrome.com/docs/capabilities/pwa-manifest-id), [ícones adaptáveis e área segura](https://web.dev/articles/maskable-icon), [instalação](https://web.dev/learn/pwa/installation).
