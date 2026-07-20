-- Permite que o dono do estabelecimento crie a entrega (corrida) para um pedido próprio
CREATE POLICY deliveries_estab_insert
  ON public.deliveries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.establishments e ON e.id = o.establishment_id
      WHERE o.id = deliveries.order_id
        AND e.owner_id = auth.uid()
    )
  );

-- Permite que o dono do estabelecimento atualize (por ex. cancelar) a entrega do próprio pedido
CREATE POLICY deliveries_estab_update
  ON public.deliveries
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.establishments e ON e.id = o.establishment_id
      WHERE o.id = deliveries.order_id
        AND e.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.establishments e ON e.id = o.establishment_id
      WHERE o.id = deliveries.order_id
        AND e.owner_id = auth.uid()
    )
  );