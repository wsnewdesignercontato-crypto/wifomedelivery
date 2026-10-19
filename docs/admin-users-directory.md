# Diretório de usuários

A página `/admin/usuarios` usa a identidade vermelha do PedeTrem, com indicadores globais, filtros de perfil e situação, tabela em telas grandes e cartões nas menores. Os perfis mantêm suas cores: cliente vermelho, estabelecimento laranja e entregador verde; administradores aparecem em violeta.

Os indicadores e contadores de perfil consideram todas as contas não excluídas, independentemente da busca. Uma conta com vários perfis aparece uma única vez no total e em cada perfil correspondente. As situações são mutuamente exclusivas: bloqueado; aguardando confirmação de e-mail; ativo com e-mail confirmado.

`admin_users_directory` aplica busca e filtros antes de paginar, com 20 contas por página e ordenação estável. A página solicitada é ajustada quando exclusões reduzem o número de páginas. A RPC exige usuário autenticado, ativo e administrador; não expõe diretamente `auth.users`. A RPC anterior `admin_search_users` permanece disponível para versões anteriores.

As ações ficam no menu de cada conta e exigem confirmação em diálogo. A própria conta permanece protegida. Administradores precisam perder esse perfil antes de serem bloqueados/excluídos. Excluir continua exigindo digitar o e-mail, usando o mesmo serviço de exclusão que preserva pedidos e pagamentos. O último administrador não pode ser removido pelo serviço existente.

Validação: testes reais de SQL em PGlite (filtros, contagem, paginação, conta excluída, autorização e entradas inválidas), ensaio no Supabase atual com rollback e revisão visual nos formatos de computador e celular.
