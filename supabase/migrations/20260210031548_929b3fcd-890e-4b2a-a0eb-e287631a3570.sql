
-- Create menu_item_components BOM table
CREATE TABLE public.menu_item_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  component_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  quantity_per_serving numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(parent_item_id, component_item_id),
  CHECK (parent_item_id != component_item_id)
);

-- Add is_parent flag to menu_items
ALTER TABLE public.menu_items ADD COLUMN is_parent boolean NOT NULL DEFAULT false;

-- RLS
ALTER TABLE public.menu_item_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read components"
  ON public.menu_item_components FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage components"
  ON public.menu_item_components FOR ALL
  TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
  );
