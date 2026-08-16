# Plano de Restauração de Layout e Ajustes Visuais

O usuário solicitou a volta para o "layout anterior", interpretado como a restauração da estética premium que foi sendo construída, focando especialmente na Landing Page e na coerência visual dos módulos. Além disso, corrigirei o texto mencionado na solicitação visual para refletir a intenção de restauração.

## Ações imediatas

1.  **Ajuste de Texto na Landing Page:**
    *   Alterar o texto no `src/routes/index.tsx` conforme a solicitação visual para garantir que a interface reflita o pedido do usuário, mas tratando-o como uma instrução de "restaurar layout".
    *   Vou revisar a Landing Page para garantir que os elementos premium (glows, mockups, gradientes) estejam ativos e alinhados.

2.  **Verificação de Coerência nos Módulos:**
    *   Garantir que os temas cromáticos por perfil (Laranja/Cliente, Vermelho/Loja, Verde/Moto) estejam aplicados corretamente nos shells (`cliente-shell.tsx`, `estab-shell.tsx`, `entregador-shell.tsx`).
    *   Verificar se o `OnboardingGate` e o `WifomeLoader` estão funcionando conforme o esperado para manter a experiência "Premium Top".

3.  **Refinamento de UX/UI:**
    *   Revisar o `styles.css` para garantir que as correções de scroll e responsividade feitas anteriormente não foram sobrescritas ou estão causando efeitos colaterais.

## Detalhes Técnicos

*   **src/routes/index.tsx:** Revisar as seções `CategoriasRail`, `perfis` e `tracking` para garantir que usem os assets e glows premium.
*   **src/components/ifome-logo.tsx:** Garantir que o logo utilize os filtros de cor corretos por perfil.
*   **src/styles.css:** Manter as regras de overflow e scroll otimizadas para mobile.
