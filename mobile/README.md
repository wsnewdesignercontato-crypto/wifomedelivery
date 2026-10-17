# PedeTrem Android e iOS

Base nativa Expo/React Native com três variantes. O conteúdo usa os serviços HTTPS atuais do PedeTrem. Não há chaves administrativas no aplicativo.

| Perfil          | Nome                     | Android applicationId / iOS bundleIdentifier |
| --------------- | ------------------------ | -------------------------------------------- |
| cliente         | PedeTrem Cliente         | app.pedetrem.cliente                         |
| estabelecimento | PedeTrem Estabelecimento | app.pedetrem.estabelecimento                 |
| entregador      | PedeTrem Entregador      | app.pedetrem.entregador                      |

## Desenvolvimento e builds

Use Node 22.13 ou superior e execute `npm ci` nesta pasta. Defina `PEDETREM_APP` com um dos três perfis antes de usar `npx expo start`, `npx expo prebuild` ou compilar localmente. As três variantes precisam de builds próprios; Expo Go serve apenas para desenvolvimento.

Os seis perfis em eas.json já fixam o aplicativo: por exemplo, `npx eas-cli build --profile cliente-preview --platform android` gera APK de teste, e `npx eas-cli build --profile cliente-production --platform android` gera AAB para Google Play. Para iPhone, use `--platform ios`. Repita com estabelecimento e entregador. Os builds preview do iOS usam distribuição interna e dispositivos cadastrados; para TestFlight use o perfil production.

Cada variante deve ser vinculada ao seu projeto Expo/EAS. Configure EAS_PROJECT_ID no ambiente do respectivo projeto. Não reutilize um único projectId nos três slugs. Não coloque certificados ou senhas no Git.

## Estado e pendências antes da publicação

Esta base ainda não é uma versão publicada nas lojas. Faltam vincular as contas Expo/EAS, Apple Developer e Google Play Console; gerar as credenciais de assinatura de cada aplicativo; compilar e testar em aparelhos reais; concluir fichas, screenshots, classificação e formulários de privacidade; e submeter à revisão.

A confirmação de cadastro abre o retorno HTTPS do perfil. As sessões permanecem isoladas por aplicativo; após confirmar o e-mail no navegador, volte ao app e entre com a senha. Não transportamos tokens de sessão em links externos.

Esta primeira base usa WebView: push web e localização contínua em segundo plano não são recursos nativos implementados. Antes de lançar, integrar e validar notificações nativas e, se necessário ao fluxo do entregador, localização em segundo plano. Validar uploads de documentos/fotos, permissões, pagamentos e comportamento dos links externos no aparelho. A aprovação da App Store não é garantida para uma base que apenas apresenta um site.

Não alteramos o botão do site para apontar a um APK ou loja enquanto não houver um arquivo assinado ou uma página real de distribuição. Os PWAs continuam disponíveis.

## Verificação de autenticação em 17/10/2026

Confirmação de e-mail permanece obrigatória. O hook de envio Brevo permanece ativo e as URLs de retorno por perfil foram preservadas. O limite global de e-mails do Supabase foi ajustado de 2 para 30 por hora; o site padrão passou a https://pedetrem.vercel.app. Isso não altera a cota contratada da Brevo. A tela de autenticação oferece reenvio com intervalo de 60 segundos e orienta usar a mesma conta nos três perfis. O parâmetro confirmado=1 sozinho não produz mensagem de confirmação sem validação do usuário no Supabase.

Para trocar de perfil em builds locais, execute prebuild --clean com PEDETREM_APP correto antes de compilar: os diretórios Android/iOS gerados são descartáveis e ignorados pelo Git. Não publique os aplicativos antes de concluir as pendências acima.
