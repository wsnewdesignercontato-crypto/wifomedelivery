CREATE POLICY "orders_courier_update"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (private.is_courier_of_order(id, auth.uid()))
  WITH CHECK (private.is_courier_of_order(id, auth.uid()));