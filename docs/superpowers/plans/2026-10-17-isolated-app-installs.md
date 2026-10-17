# Instalação dos três apps e cor do carregamento

Pedido autorizado: corrigir a instalação que permite somente um app no Chrome Android e o logo laranja ao retornar à página inicial vermelha.

O isolamento apenas por caminhos passou nas verificações de manifesto, mas não resolveu o comportamento no aparelho relatado pelo proprietário. A documentação oficial do Chrome recomenda origens distintas para apps independentes. Manter o cliente em `pedetrem.vercel.app` e acrescentar `pedetrem-loja.vercel.app` e `pedetrem-entregador.vercel.app`, todos no projeto `wifomedelivery` da conta WS. Preservar caminhos, IDs, banco e instalações anteriores. Não comprar domínio.

- [x] Reproduzir a marca incorreta em carregamento com o router real e a aceitação de instalação na origem compartilhada.
- [x] Vincular instalação à origem de cada perfil e direcionar os links de entrada da landing page e os botões de instalação ao endereço correto.
- [x] Reter a oferta nativa de instalação desde a carga do documento, mesmo antes de montar a faixa.
- [x] Usar o destino pendente no carregador, com tema explícito para o cliente.
- [x] Configurar os dois endereços HTTPS no mesmo projeto Vercel e acrescentar somente os retornos necessários à lista de autenticação Supabase e ao hook de e-mails.
- [ ] Verificar testes, lint, TypeScript, builds, redirects, origem/manifesto/ícones servidos, logs e a associação dos endereços ao commit publicado.
- [ ] Publicar e registrar evidências, distinguindo checagens técnicas de instalação física não observada.

Fonte: https://web.dev/articles/building-multiple-pwas-on-the-same-domain
