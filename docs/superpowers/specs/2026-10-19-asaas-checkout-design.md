# Pagamento no checkout do PedeTrem com Asaas

Estado: especificação de checkout transparente aprovada pelo usuário em 19/10/2026. A configuração da Asaas no admin já está publicada; o pagamento online descrito aqui ainda não foi implementado. O plano escrito será revisado antes da implementação, preservando a execução nesta sessão escolhida pelo usuário.

## Objetivo e decisões existentes

O usuário confirmou que quer os dois: configuração da Asaas no administrador e pagamento no checkout do cliente. O pagamento deve permanecer ligado ao pedido correto, aos avisos do estabelecimento e ao acompanhamento do cliente, sem duplicar cobranças.

Preservar Supabase `nsvgfagjezdduatmbsqq`, o projeto Vercel `wifomedelivery` e os três aplicativos com suas origens e identidades de instalação. As credenciais ficam no Vault e são usadas exclusivamente pelo servidor. Não solicitar chaves, senhas ou códigos pelo chat.

Preservar as decisões anteriores sobre cupons: a loja paga seu próprio cupom e a plataforma paga o cupom da plataforma. Preservar a conferência manual pelo admin para disponibilizar saldo de saque; confirmação do pagamento online não autoriza automaticamente repasses ou saques.

## Escolha aprovada na conversa

O usuário escolheu **checkout transparente**: a interface de pagamento pertence ao PedeTrem e a Asaas processa as cobranças pela API. A proposta anterior de abrir o checkout hospedado foi substituída. A referência verbal a “Azure” na última mensagem mantém o provedor já confirmado, **Asaas**; não introduz Microsoft Azure.

**Pix:** mostrar a imagem do QR Code e o código copia e cola dentro do aplicativo. O cliente faz a transferência pelo seu banco e volta ao acompanhamento do pedido. **Cartão de crédito:** mostrar o formulário no próprio checkout; o servidor encaminha a tentativa à API Asaas. Não abrir a fatura ou a página hospedada da Asaas como jornada padrão.

Esta entrega cobre Pix e cartão de crédito à vista. Não inclui débito online, parcelamento, boleto, assinatura ou salvar cartão para compras futuras. Dinheiro e os meios já oferecidos para pagamento na entrega permanecem claramente separados dos novos meios online. Uma exigência de autenticação bancária, se aplicável à conta e à cobrança, precisa ser tratada explicitamente; não apresentar um cartão em análise como aprovado.

## Jornada do cliente

1. O cliente continua navegando sem login. Ao comprar, mantém as exigências existentes de autenticação, telefone e endereço quando necessário para a entrega.
2. O checkout distingue **Pix online**, **Cartão online** e **Pagamento na entrega**. As opções online aparecem somente quando o administrador habilitar a integração de produção e a revisão atual tiver chave testada e webhook registrado.
3. O servidor calcula o total com os preços, adicionais, frete e cupom do banco. Não aceita um valor financeiro fornecido pelo navegador como autoridade.
4. Ao escolher pagamento online, cria o pedido em `pending_payment`, reserva estoque e cupom e cria a tentativa de cobrança Asaas. O total enviado inclui frete e desconto, exatamente em centavos, sem recalcular taxas no navegador. A janela operacional para concluir o pagamento é de 10 minutos; isso não deve ser confundido com a validade bancária do QR Code Pix.
5. Para Pix, persistir a cobrança e sua associação com o pedido, obter QR Code e código copia e cola e apresentar ambos no aplicativo. Para cartão, validar dados do titular e do cartão e enviar uma única tentativa de autorização/captura imediata à Asaas. O cliente pode retomar um Pix existente pelo pedido, sem gerar outra cobrança.
6. A tela exibe o estado salvo no servidor: **Aguardando pagamento**, **Processando cartão**, **Aguardando análise**, **Pagamento não autorizado** ou **Pagamento confirmado**, conforme o resultado real. Nenhum parâmetro de URL, clique em “Já paguei” ou informação do navegador prova pagamento.
7. Depois da confirmação, o pedido passa para `placed`, a loja recebe um único aviso e começa o prazo existente de 60 segundos para aceitar. O restante do fluxo de preparo, despacho e entrega permanece o mesmo.

Um pedido totalmente coberto por desconto, com total zero, segue pelo fluxo gratuito validado pelo servidor, sem tentativa de criar uma cobrança de valor zero.

## Integração e persistência

Estender o módulo Asaas existente com um serviço servidor para cadastrar/localizar o cliente Asaas, criar ou recuperar cobranças, obter dados Pix e processar os eventos de cobrança. Usar `/customers`, `/payments` e `/payments/{id}/pixQrCode`, com os hosts de API correspondentes ao ambiente. A API `/checkouts` e seus eventos `CHECKOUT_*` não fazem parte da jornada escolhida.

Registrar separadamente pedido, usuário, cliente Asaas, ambiente, revisão da configuração, referência externa, identificador da cobrança, valor esperado, método, expiração operacional e estado da tentativa. Usar uma relação privada e DTOs específicos: o cliente vê apenas suas próprias informações de pagamento; o admin vê os dados de conciliação; estabelecimento e entregador não recebem chaves nem dados de cartão. A associação do cliente Asaas pertence ao usuário e ao ambiente; não reaproveitar cadastros de outra pessoa ou procurar somente por e-mail.

Usar a chave de idempotência existente do checkout e bloqueio compartilhado por tentativa, com duração compatível com o processamento do cartão. Cliques repetidos e respostas fora de ordem não criam novos pedidos nem cobranças simultâneas. Cada tentativa possui uma referência externa persistida antes da chamada ao provedor. Em timeout ou resposta inconclusiva, consultar `/payments` filtrando por essa referência e conferir cliente, método e valor antes de qualquer nova tentativa. Uma lista vazia imediatamente após timeout não prova que a operação falhou: manter estado inconclusivo e conciliar; não repetir automaticamente o POST do cartão.

Usar timeout de pelo menos 60 segundos para o processamento de cartão, conforme a Asaas; não reutilizar o timeout de 8 segundos da consulta administrativa de saldo. Ajustar a duração da função na Vercel para comportar a chamada e a persistência do resultado. Capturar o IP do pagador a partir do contexto confiável de requisição da plataforma, sem aceitar um IP enviado no formulário como autoridade.

## Formulário e proteção dos dados de pagamento

Solicitar nome e CPF/CNPJ necessários para cadastrar o pagador na Asaas. Para cartão, solicitar titular, número, validade, código de segurança e os dados de identificação/endereço exigidos pelo provedor. Essa exigência ocorre no pagamento online, sem tornar o cadastro geral obrigatório para navegar. Validar formatos no cliente para orientação e novamente no servidor antes da chamada à API; valores inválidos não chegam ao provedor.

Número completo do cartão, código de segurança e corpo bruto da requisição não podem ser persistidos em tabelas, Vault, storage, logs, auditoria, notificações, analytics, localStorage ou sessionStorage. Manter os campos apenas na memória do formulário durante a operação e limpar após a tentativa ou ao sair. Não instalar captura de formulários ou replay de sessão nessa tela. Os erros retornados ao cliente são mensagens sanitizadas e não ecoam os dados enviados.

Transportar os dados exclusivamente por HTTPS e usar a chave Asaas somente no servidor. Esta entrega não armazena nem reutiliza tokens de cartão; isso evita depender da habilitação de tokenização em produção para oferecer a primeira compra. Cadastro do pagador e campos de cartão devem atender aos requisitos aplicáveis ao checkout próprio; não declarar conformidade ou certificação apenas por usar a API Asaas.

O ambiente é escolhido pelo servidor. A produção pública nunca usa Sandbox. Testes de Sandbox ficam restritos ao admin, com identificação visual e sem envio de pedidos às lojas reais, sem repasses e sem alterações no estoque real.

O admin ganha um controle explícito para habilitar o pagamento online em produção, inicialmente desligado. Salvar outra chave ou mudar a revisão exige novo teste e registro do webhook antes de disponibilizar novos pagamentos. Pedidos existentes continuam identificados pela configuração e conta que os criaram; impedir troca silenciosa de conta com pagamentos ativos e exigir conciliação antes dessa troca.

## Eventos e sincronização

Registrar os eventos de cobrança necessários para confirmação, disponibilidade do valor, recusa de captura, análise de risco, exclusão, estorno e contestação. `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` representam estados financeiros diferentes; eventos de criação ou autorização isolada não liberam o pedido. Não depender de eventos `CHECKOUT_*`, pois esta integração cria cobranças diretamente.

Validar o token do webhook antes de interpretar o corpo. Corrigir o formato de identificador de evento: a documentação oficial contém IDs com `&`, que a validação atualmente publicada rejeita. Manter limites de tamanho e rejeição de controles, com a mesma regra no servidor e no banco.

Persistir os metadados necessários antes de responder sucesso. Processar cada evento de forma idempotente, com bloqueio do pedido, sem regressão de estado causada por eventos antigos. Um evento de cobrança desconhecida não pode confirmar um pedido por coincidência de referência externa. Quando o webhook chega antes da resposta de criação, retê-lo para conciliação com a tentativa persistida, verificando também o cliente Asaas, o ambiente e o valor.

Confirmar cobrança, conta/ambiente, associação ao pedido, cliente Asaas, método, valor bruto e estado contra os registros da integração e a API do provedor. Não comparar o total do pedido com o valor líquido após as taxas Asaas. Um nome de evento isolado não basta para liberar valores.

Somente a confirmação válida de produção pode mover `pending_payment` para `placed`. Alterar o gatilho de prazo para não contar os 60 segundos durante o pagamento e alterar a notificação da loja para cobrir a transição `pending_payment → placed` sem duplicar os avisos de pedidos pagos na entrega.

## Expiração, cancelamento e reembolso

Ao vencer a janela operacional de 10 minutos sem pagamento confirmado, conciliar primeiro o estado da cobrança e solicitar seu cancelamento na Asaas quando permitido. Cancelar o pedido e devolver estoque e uso do cupom uma única vez. A tela deve informar que o pedido expirou e ocultar o Pix para pagamento; um contador local não cancela uma cobrança bancária. Se a operação estiver em análise ou inconclusiva, manter uma pendência de conciliação, sem produzir outra tentativa concorrente. Um processo periódico recupera pendências mesmo com o navegador fechado.

Se a confirmação chegar depois de o pedido ter sido cancelado ou o estoque ter sido liberado, não ressuscitar o pedido. Registrar a ocorrência e abrir uma pendência de reembolso para o admin, com aviso claro ao cliente.

Pedidos pagos cancelados pela loja, pelo cliente ou pelo prazo de resposta também geram pendência de reembolso. O sistema não pode mostrar **Reembolsado** antes da confirmação real do provedor. A primeira entrega mantém análise administrativa do reembolso; não executa devoluções automaticamente. O admin acompanha referência, valor e estado e registra a devolução efetuada na Asaas, com validação do recebimento do evento correspondente.

Não confundir autorização do cartão, pagamento confirmado e saldo disponível na Asaas. Continuar respeitando a conferência manual para saldo de saque. Eventos de estorno ou contestação bloqueiam nova liberação e geram uma pendência administrativa visível; não enviar transferências automáticas.

## Financeiro e telas dos outros perfis

Admin: visualizar pedido, meio online/entrega, valor bruto, estado do pagamento, identificadores Asaas, confirmação, expiração e pendências de reembolso/conciliação. Não usar o saldo total da conta Asaas como saldo da loja ou do entregador.

Estabelecimento: pedidos pendentes de pagamento não entram na fila de novos pedidos nem disparam o toque. Após confirmação, receber o pedido uma única vez e mostrar a informação de pagamento online para não cobrar novamente na entrega.

Entregador: manter a disputa atômica existente por corrida e o despacho após a preparação. Mostrar que o pedido já foi pago online, evitando cobrança duplicada do cliente. Não oferecer uma corrida apenas porque uma tentativa de pagamento foi criada.

## Verificação e liberação

- Validar autorização, propriedade do pedido, ambiente e revisão em todas as operações de pagamento.
- Testar total alterado, desconto integral, dois cliques, duas abas, timeout de criação, reconciliação antes da repetição e webhook antes da resposta de criação.
- Testar IDs de evento com `&`, repetição e reordenação dos eventos, token inválido, valor divergente, cobrança desconhecida e tentativa de usar Sandbox em pedido real.
- Testar CPF/CNPJ, titular, validade, telefone, CEP e IP do pagador; testar cartão recusado, em análise e confirmado; validar exibição e cópia do Pix existente.
- Verificar que o formulário, erros, logs, auditoria, DTOs e armazenamento do navegador nunca retêm número completo ou código de segurança do cartão. Usar somente cartões e identidades fictícios documentados para Sandbox.
- Testar que o prazo da loja só inicia após confirmação e que notificação/toque ocorrem uma única vez. Verificar que pedidos na entrega mantêm o comportamento atual.
- Testar expiração e cancelamento concorrentes ao pagamento, estoque e cupom restaurados uma vez, pagamento tardio e pendência de reembolso.
- Testar conferência manual, saldo de saque, cupons, estornos e contestações sem dupla liberação.
- Rodar os contratos SQL com rollback e credenciais fictícias; verificar os três aplicativos, testes, tipagem, lint, build e artefatos públicos.
- Homologar o fluxo completo no Sandbox com a chave informada no painel. Essa homologação depende da credencial e não pode ser substituída por mocks apresentados como teste real.
- Publicar na Vercel com o controle de produção desligado; ativar após homologação e configuração de produção. Não criar cobranças reais de teste sem instrução explícita.

## Referências e pontos confirmados no código

- `src/lib/checkout.functions.ts`: cria pedido via `checkout_order` com idempotência.
- `src/routes/_authenticated/cliente.checkout.tsx`: hoje comunica pagamento na entrega; precisa distinguir os canais.
- `supabase/migrations/20261016025222_audit_checkout_finance.sql`: cálculo transacional, reservas, cupons e conferência manual.
- `supabase/migrations/20261018201942_order_acceptance_deadline.sql`: atualmente inicia 60 segundos no INSERT; deve respeitar pagamento pendente.
- `supabase/migrations/20260801164309_7528cbf4-b282-426d-a2a3-575de2401257.sql`: aviso da loja hoje acontece somente no INSERT com `placed`.
- [Cobranças via cartão no checkout próprio](https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito).
- [Criar cobrança com cartão; timeout mínimo de 60 segundos](https://docs.asaas.com/reference/criar-cobranca-com-cartao-de-credito).
- [Cobranças via Pix](https://docs.asaas.com/docs/cobrancas-via-pix).
- [Obter QR Code e código copia e cola](https://docs.asaas.com/reference/obter-qr-code-para-pagamentos-via-pix).
- [Consultar cobranças por referência externa](https://docs.asaas.com/reference/listar-cobrancas).
- [Cadastro de clientes Asaas](https://docs.asaas.com/docs/criando-um-cliente).
- [Eventos de cobranças](https://docs.asaas.com/docs/webhook-para-cobrancas).
