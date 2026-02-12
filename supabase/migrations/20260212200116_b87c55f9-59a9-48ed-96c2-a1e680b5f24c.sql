
-- Drop existing restrictive policies on sales_data
DROP POLICY IF EXISTS "Admins can manage sales data" ON public.sales_data;
DROP POLICY IF EXISTS "Anyone can read sales data" ON public.sales_data;

-- Recreate as permissive policies
CREATE POLICY "Admins can manage sales data"
ON public.sales_data
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can read sales data"
ON public.sales_data
FOR SELECT
TO authenticated
USING (true);
