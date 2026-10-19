# Configuração da Asaas

Em **Admin → Configurações → Conexão de pagamentos**, escolha **Testes (Sandbox)** ou **Produção**. Cada ambiente mantém sua própria chave e seu próprio webhook.

1. Informe o e-mail para avisos e a chave API da conta Asaas correspondente ao ambiente.
2. Salve. O token de autenticação do webhook é gerado automaticamente quando o campo fica vazio no primeiro cadastro. Campos de segredo vazios nas próximas gravações preservam o valor salvo.
3. Clique em **Testar conexão**. O servidor faz somente uma consulta de saldo, sem retornar o saldo ao navegador e sem criar cobranças.
4. Após o teste, clique em **Registrar/atualizar webhook**. O servidor cadastra a URL exibida e o token de autenticação na Asaas. O painel informa a data do último evento recebido.

As chaves são armazenadas no Supabase Vault, acessíveis somente pelo servidor. O navegador recebe apenas o estado da configuração. A troca de credenciais invalida o teste anterior; teste e registre novamente. Uma operação de registro bloqueia temporariamente novas gravações e outros registros no mesmo ambiente.

O endpoint público é `/api/payments/asaas/webhook?environment=sandbox` ou `production`. Ele exige o cabeçalho `asaas-access-token`, confirma somente eventos persistidos e deduplica pelo identificador do evento e ambiente. Guarda apenas identificadores, tipo, status e horário; não grava o corpo recebido nem dados de cartão ou cliente.

Esta etapa prepara a conexão e o recebimento de eventos. **Não ativa pagamento online no checkout, não cria cobranças, não faz transferências e não altera pedidos, saldos ou repasses.** A operação real depende de inserir uma chave válida e executar o teste no painel. Sandbox não movimenta dinheiro real; a chave de Sandbox não serve para Produção.

Referências oficiais: [autenticação](https://docs.asaas.com/docs/autentica%C3%A7%C3%A3o-1), [consulta de saldo](https://docs.asaas.com/reference/recuperar-saldo-da-conta), [registro de webhook](https://docs.asaas.com/reference/create-new-webhook), [recebimento de eventos](https://docs.asaas.com/docs/receive-asaas-events-at-your-webhook-endpoint).
