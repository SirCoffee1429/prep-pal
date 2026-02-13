
-- Drop existing restrictive policies on sales_data
DROP POLICY IF EXISTS "Admins can manage sales data" ON public.sales_data;
DROP POLICY IF EXISTS "Anyone can read sales data" ON public.sales_data;

-- Create PERMISSIVE policies (default) that include anon role
CREATE POLICY "Anyone can read sales data"
ON public.sales_data
FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert sales data"
ON public.sales_data
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update sales data"
ON public.sales_data
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "Admins can delete sales data"
ON public.sales_data
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
