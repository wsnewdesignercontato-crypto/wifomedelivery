# Aplicativos por perfil e visita do cliente

Pedido explícito do proprietário em 15/10: preservar as correções A01–A18 e acrescentar três instalações PWA independentes (cliente vermelho, loja laranja, entregador verde), banner superior por perfil, catálogo do cliente sem login e dados obrigatórios somente na compra.

## Desenho

- Preservar os três IDs de manifest existentes para atualizar instalações anteriores. Diferenciar nomes, ícones, cores e destinos de abertura. Um único controlador de manifest e instalação evita eventos vinculados ao perfil anterior.
- Detectar instalação por execução standalone, evento real `appinstalled` e `getInstalledRelatedApps` onde disponível. Flags antigas não comprovam instalação nem desinstalação; API indisponível implica estado desconhecido e instruções acessíveis. Não esconder permanentemente um aplicativo por instalação de outro.
- Permitir anonimamente somente início, busca, novidades e cardápio da área cliente. Favoritos, pedidos, perfil, carrinho e checkout exigem sessão. A ação de pedir no cardápio leva ao login e retorna ao mesmo cardápio. Loja, entregador e admin permanecem protegidos.
- Remover o bloqueio global de completude do cliente. Na finalização, exigir telefone válido e endereço cadastrado, tanto na interface quanto no PostgreSQL. Modal identifica o dado faltante e abre a página correspondente; os dados preenchidos liberam a compra. Cadastro básico não exige esses dados.
- Verificar limites com testes puros, contratos de banco, navegação anônima/autenticada, retorno do login, três manifests/ícones, desktop e celular. Detecção de instalação/desinstalação no iOS e navegadores sem API tem limitação documentada.

## Execução

- [ ] Testes de acesso público, retorno seguro, dados da compra e evidências de instalação por perfil.
- [ ] Fronteira de autenticação e catálogo visitante; checkout/modal e retorno dos formulários.
- [ ] Regra de telefone/endereço no banco e regressões dos fluxos autorizados.
- [ ] Logos por perfil, manifests, controlador de instalação único e banner superior.
- [ ] Testes integrados, build, publicação e verificação junto às correções da auditoria.
