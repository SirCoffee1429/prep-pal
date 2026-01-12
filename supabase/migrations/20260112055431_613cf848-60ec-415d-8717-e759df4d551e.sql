-- Add new columns to recipes table for Production Spec data
ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS yield_amount text,
ADD COLUMN IF NOT EXISTS yield_measure text,
ADD COLUMN IF NOT EXISTS shelf_life text,
ADD COLUMN IF NOT EXISTS tools jsonb,
ADD COLUMN IF NOT EXISTS vehicle text,
ADD COLUMN IF NOT EXISTS recipe_cost numeric,
ADD COLUMN IF NOT EXISTS portion_cost numeric,
ADD COLUMN IF NOT EXISTS menu_price numeric,
ADD COLUMN IF NOT EXISTS food_cost_percent numeric;