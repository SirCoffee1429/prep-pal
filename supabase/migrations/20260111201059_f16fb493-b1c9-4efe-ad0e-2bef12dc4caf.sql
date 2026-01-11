-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'staff');

-- Create stations enum
CREATE TYPE public.kitchen_station AS ENUM ('grill', 'saute', 'fry', 'salad', 'line');

-- Create prep status enum
CREATE TYPE public.prep_status AS ENUM ('open', 'in_progress', 'completed');

-- Create user_roles table for admin authentication
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Policy: Users can view their own roles
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Create menu_items table
CREATE TABLE public.menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    station kitchen_station NOT NULL,
    unit TEXT NOT NULL DEFAULT 'portions',
    recipe_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on menu_items
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read menu items (staff need this)
CREATE POLICY "Anyone can read menu items"
ON public.menu_items
FOR SELECT
TO anon, authenticated
USING (true);

-- Policy: Only admins can modify menu items
CREATE POLICY "Admins can manage menu items"
ON public.menu_items
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create par_levels table (day-specific par levels)
CREATE TABLE public.par_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE CASCADE NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    par_quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (menu_item_id, day_of_week)
);

-- Enable RLS on par_levels
ALTER TABLE public.par_levels ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read par levels
CREATE POLICY "Anyone can read par levels"
ON public.par_levels
FOR SELECT
TO anon, authenticated
USING (true);

-- Policy: Only admins can modify par levels
CREATE POLICY "Admins can manage par levels"
ON public.par_levels
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create recipes table
CREATE TABLE public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    ingredients JSONB,
    method TEXT,
    plating_notes TEXT,
    file_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add foreign key from menu_items to recipes
ALTER TABLE public.menu_items
ADD CONSTRAINT fk_menu_items_recipe
FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE SET NULL;

-- Enable RLS on recipes
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read recipes
CREATE POLICY "Anyone can read recipes"
ON public.recipes
FOR SELECT
TO anon, authenticated
USING (true);

-- Policy: Only admins can modify recipes
CREATE POLICY "Admins can manage recipes"
ON public.recipes
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create prep_lists table (daily prep list header)
CREATE TABLE public.prep_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prep_date DATE NOT NULL UNIQUE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on prep_lists
ALTER TABLE public.prep_lists ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read prep lists
CREATE POLICY "Anyone can read prep lists"
ON public.prep_lists
FOR SELECT
TO anon, authenticated
USING (true);

-- Policy: Only admins can create prep lists
CREATE POLICY "Admins can manage prep lists"
ON public.prep_lists
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create prep_list_items table (individual prep tasks)
CREATE TABLE public.prep_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prep_list_id UUID REFERENCES public.prep_lists(id) ON DELETE CASCADE NOT NULL,
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE CASCADE NOT NULL,
    quantity_needed INTEGER NOT NULL DEFAULT 0,
    status prep_status NOT NULL DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on prep_list_items
ALTER TABLE public.prep_list_items ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read prep list items
CREATE POLICY "Anyone can read prep list items"
ON public.prep_list_items
FOR SELECT
TO anon, authenticated
USING (true);

-- Policy: Anyone can update prep list item status (staff can mark tasks)
CREATE POLICY "Anyone can update prep list item status"
ON public.prep_list_items
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Policy: Only admins can insert/delete prep list items
CREATE POLICY "Admins can manage prep list items"
ON public.prep_list_items
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create sales_data table for tracking daily sales
CREATE TABLE public.sales_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE CASCADE NOT NULL,
    sales_date DATE NOT NULL,
    quantity_sold INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (menu_item_id, sales_date)
);

-- Enable RLS on sales_data
ALTER TABLE public.sales_data ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read sales data
CREATE POLICY "Anyone can read sales data"
ON public.sales_data
FOR SELECT
TO anon, authenticated
USING (true);

-- Policy: Only admins can modify sales data
CREATE POLICY "Admins can manage sales data"
ON public.sales_data
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add updated_at triggers
CREATE TRIGGER update_menu_items_updated_at
    BEFORE UPDATE ON public.menu_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_par_levels_updated_at
    BEFORE UPDATE ON public.par_levels
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recipes_updated_at
    BEFORE UPDATE ON public.recipes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_prep_list_items_updated_at
    BEFORE UPDATE ON public.prep_list_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for prep_list_items (for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.prep_list_items;

-- Create storage bucket for recipes
INSERT INTO storage.buckets (id, name, public) VALUES ('recipes', 'recipes', true);

-- Storage policy: Anyone can read recipe files
CREATE POLICY "Anyone can read recipe files"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'recipes');

-- Storage policy: Authenticated admins can upload recipe files
CREATE POLICY "Admins can upload recipe files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'recipes' AND public.has_role(auth.uid(), 'admin'));

-- Storage policy: Authenticated admins can delete recipe files
CREATE POLICY "Admins can delete recipe files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'recipes' AND public.has_role(auth.uid(), 'admin'));

-- Create storage bucket for sales files
INSERT INTO storage.buckets (id, name, public) VALUES ('sales-files', 'sales-files', false);

-- Storage policy: Admins can manage sales files
CREATE POLICY "Admins can read sales files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'sales-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can upload sales files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'sales-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete sales files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'sales-files' AND public.has_role(auth.uid(), 'admin'));