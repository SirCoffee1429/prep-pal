-- First add a unique constraint on menu_items.name to prevent duplicates
ALTER TABLE menu_items ADD CONSTRAINT menu_items_name_unique UNIQUE (name);