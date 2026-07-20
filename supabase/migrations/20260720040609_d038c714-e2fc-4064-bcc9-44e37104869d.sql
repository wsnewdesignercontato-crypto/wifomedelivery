
DROP VIEW IF EXISTS public.available_couriers;
DROP FUNCTION IF EXISTS private.available_couriers();

CREATE POLICY "Merchants view online approved couriers"
ON public.courier_profiles FOR SELECT
TO authenticated
USING (
  status = 'online'
  AND aprovacao = 'approved'
  AND (private.has_role(auth.uid(), 'estabelecimento') OR private.has_role(auth.uid(), 'admin'))
);
