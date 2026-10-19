# Configurações administrativas

`/admin/configuracoes` aproveita toda a área de conteúdo e organiza os controles em quatro abas:

- **Geral:** identidade da plataforma, comissão, entrega, anúncios, suporte e manutenção.
- **Pagamentos:** credenciais Asaas, checkout online e simulador, em colunas nas telas grandes.
- **E-mails:** conexão Brevo, remetente e credenciais.
- **Qualidade:** pontuação inicial, faixas, atrasos e avaliações.

Os painéis permanecem montados ao trocar de aba para preservar dados digitados, inclusive campos privados ainda não salvos. As integrações continuam com seus próprios botões e confirmações. A barra de salvamento geral fica disponível nas abas Geral e Qualidade. Nenhuma regra financeira, ativação de pagamentos ou credencial foi alterada pelo ajuste visual.

Os componentes usam largura fluida e colunas com `minmax(0, ...)`; no celular, os grupos são empilhados. Botões de texto longo podem quebrar linha dentro da página. Esse ajuste é limitado aos elementos `data-ui="button"`, preservando as dimensões de switches e abas.

O diretório `/admin/usuarios` também utiliza toda a largura disponível, mantendo tabela em telas grandes e cartões nas menores.
