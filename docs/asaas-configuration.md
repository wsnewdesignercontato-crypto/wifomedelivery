# Configuração da Asaas

Em **Admin → Configurações → Conexão de pagamentos**, escolha **Testes (Sandbox)** ou **Produção**. Cada ambiente mantém sua própria chave e seu próprio webhook.

1. Informe o e-mail para avisos e a chave API da conta Asaas correspondente ao ambiente.
2. Salve. O token de autenticação do webhook é gerado automaticamente quando o campo fica vazio no primeiro cadastro. Campos de segredo vazios nas próximas gravações preservam o valor salvo.
3. Clique em **Testar conexão**. O servidor faz somente uma consulta de saldo, sem retornar o saldo ao navegador e sem criar cobranças.
4. Após o teste, clique em **Registrar/atualizar webhook**. O servidor cadastra a URL exibida e o token de autenticação na Asaas. O painel informa a data do último evento recebido.

As chaves são armazenadas no Supabase Vault, acessíveis somente pelo servidor. O navegador recebe apenas o estado da configuração. A troca de credenciais invalida o teste anterior; teste e registre novamente. Uma operação de registro bloqueia temporariamente novas gravações e outros registros no mesmo ambiente.

O endpoint público é `/api/payments/asaas/webhook?environment=sandbox` ou `production`. Ele exige o cabeçalho `asaas-access-token`, confirma somente eventos persistidos e deduplica pelo identificador do evento e ambiente. Guarda apenas identificadores, tipo, status e horário; não grava o corpo recebido nem dados de cartão ou cliente.

Depois de homologar no Sandbox, configure e teste Produção, registre o webhook atualizado e use o controle separado **Ativar pagamentos em produção**. O checkout começa desativado. Apenas selecionar Produção ou testar a chave não ativa cobranças. A configuração não pode ser trocada enquanto existirem pagamentos ou pendências sem conciliação.

O cliente escolhe **Pagar online** ou **Pagar na entrega**. Pix online mostra QR Code e código copia e cola dentro do PedeTrem; cartão online é à vista, com o formulário no aplicativo e processamento pela Asaas. Não há boleto, débito, parcelamento ou cartão salvo. Dados completos do cartão não são armazenados em pedidos, logs ou no navegador pelo aplicativo e os campos são apagados após a tentativa.

O pedido online fica **Aguardando pagamento**. Somente a confirmação verificada da cobrança envia o pedido à loja e inicia seu prazo de 60 segundos. Análise de risco ou resposta incerta não gera outra cobrança automaticamente. Use **Conferir pagamento**; não pague novamente enquanto houver dúvida. Um pedido sem valor a cobrar segue sem criar cobrança.

O prazo operacional é de dez minutos, independentemente da validade bancária do QR Pix. Um pagamento recebido após cancelamento ou sem possibilidade de atendimento gera uma pendência de reembolso. Pedido cancelado não é reativado por um pagamento tardio. A plataforma não declara um estorno concluído sem consultar o provedor e não faz transferências ou reembolsos automáticos.

Em **Admin → Financeiro → Pagamentos online · Asaas**, acompanhe cobranças, valores brutos/líquidos, referências e pendências, inclusive de pedidos cancelados antes da entrega. **Conferir na Asaas** consulta o estado real. Reembolsos e contestações devem ser tratados no painel da Asaas e depois conciliados. Confirmado (`CONFIRMED`) ainda pode estar indisponível; recebido (`RECEIVED`) indica disponibilidade na Asaas. O recebimento online não substitui a conferência manual do admin para liberar saldo após a entrega, nem transforma saldo da plataforma em saldo da loja.

O worker `/api/internal/asaas-reconcile` usa `ASAAS_RECONCILE_SECRET`, exclusivo do servidor, com o mesmo valor no Vault como `asaas_reconcile_secret`. Supabase Cron chama a origem canônica a cada minuto, mesmo sem navegador aberto. O webhook persiste somente metadados e o worker verifica o pagamento na API. Leases e referências por tentativa impedem reenvio automático do cartão. O runtime Vercel tem duração de 120 segundos; chamadas de cartão usam 65 segundos e consultas têm timeout de oito segundos.

Uma cobrança extra não substitui o pagamento que financiou o pedido. Cada cobrança extra gera sua própria pendência; o saldo fica retido até os estornos serem confirmados e o admin revisar novamente a liberação. Credenciais históricas ficam versionadas no Vault para conciliar pedidos antigos após mudanças na configuração. Mantenha a chave histórica válida na Asaas enquanto houver possibilidade de estorno/contestação; revogar uma chave no provedor também impede consultas com essa chave.

**Homologação:** o botão **Gerar Pix fictício no Sandbox** cria somente um diagnóstico de R$ 10,00 no ambiente de testes, sem pedido, estoque ou ledger reais. Confira o ID no painel Sandbox. A chave Sandbox é diferente da chave de Produção. Os contratos locais/SQL usam fixtures fictícias e rollback; isso não substitui testes reais com a conta Asaas do usuário. Sem uma chave Sandbox configurada, a homologação externa de Pix, cartão e callbacks permanece pendente. Produção deve permanecer desligada até essa validação.

Referências oficiais: [autenticação](https://docs.asaas.com/docs/autentica%C3%A7%C3%A3o-1), [consulta de saldo](https://docs.asaas.com/reference/recuperar-saldo-da-conta), [registro de webhook](https://docs.asaas.com/reference/create-new-webhook), [recebimento de eventos](https://docs.asaas.com/docs/receive-asaas-events-at-your-webhook-endpoint).
