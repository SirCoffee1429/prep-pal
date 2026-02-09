

## Overview
When a workbook is uploaded, the system will now extract **ingredients from Column A, Rows 3-23** of each sheet and automatically create **Bill of Materials (BOM)** links between parent menu items and their ingredient components. This means the import process will produce three outputs per sheet instead of one: the menu item or recipe record, plus all its ingredient-component relationships.

## What Changes

Currently, uploading a workbook creates menu items and recipes as standalone records. After this change:

```text
BEFORE (uploading "Caesar Salad" workbook):
  -> Creates: Menu Item "Caesar Salad"
  -> Creates: Recipe "Caesar Dressing"
  -> No relationship between them

AFTER:
  -> Creates: Menu Item "Caesar Salad"
  -> Creates: Recipe "Caesar Dressing"
  -> Extracts ingredients from A3:A23: Romaine, Caesar Dressing, Crispy Parm, Croutons
  -> Auto-creates BOM links:
       Caesar Salad -> Romaine (1 per serving)
       Caesar Salad -> Caesar Dressing (1 per serving)
       Caesar Salad -> Crispy Parm (1 per serving)
       Caesar Salad -> Croutons (1 per serving)
  -> Auto-creates component menu_items for any ingredient not already in DB
```

## Implementation Steps

### Step 1: Create the `menu_item_components` Table (Database Migration)

```sql
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
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
```

### Step 2: Extract Ingredients During Workbook Processing

In `UnifiedImportWizard.tsx`, when processing `.xlsx` sheets, read cells A3 through A23 directly using SheetJS before sending to the AI. This is deterministic -- no AI needed for ingredient extraction.

```typescript
// For each sheet in the workbook:
const ingredientNames: string[] = [];
for (let row = 3; row <= 23; row++) {
  const cellRef = `A${row}`;
  const cell = worksheet[cellRef];
  if (cell && cell.v) {
    const val = String(cell.v).trim();
    if (val && val.length > 1) {
      ingredientNames.push(val);
    }
  }
}
```

Store these alongside the parsed item so they're available at import time.

### Step 3: Update the `ParsedItem` Interface

```typescript
interface ParsedItem {
  id: string;
  name: string;
  type: "menu_item" | "prep_recipe" | "sales_data";
  station: KitchenStation;
  status: "new" | "duplicate_menu" | "duplicate_recipe" | "duplicate_db";
  existing_id?: string;
  original_data: any;
  source_file: string;
  // NEW: ingredients extracted from A3:A23
  ingredients: string[];
}
```

### Step 4: Update the Review UI

In Step 2 (Review), show a collapsed "Components" count badge for items that have ingredients. Optionally expandable to see the list.

```text
+-------------------------------------------------------+
| Caesar Salad  | Menu Item | Salad | Sheet1 | New      |
|               | [4 components]                         |
+-------------------------------------------------------+
```

### Step 5: Update `handleFinalImport` -- Three-Phase Insert

The import logic becomes three phases:

**Phase 1: Create menu items and recipes** (existing behavior, unchanged)

**Phase 2: Ensure component items exist in `menu_items`**
For each parent item's ingredient list:
- Normalize the ingredient name
- Check if it already exists in `menu_items` (from the preflight fetch or batch)
- If not, insert it as a new `menu_item` with `is_parent = false` and a best-guess station (using `inferStation` or defaulting to "line")

**Phase 3: Create BOM links in `menu_item_components`**
- Look up the parent's `menu_item_id` (just created or existing)
- Look up each component's `menu_item_id`
- Upsert into `menu_item_components` with `quantity_per_serving = 1` (default, editable later)
- Set `is_parent = true` on the parent item

```typescript
// Phase 2 & 3 pseudocode:
for (const item of itemsWithIngredients) {
  const parentId = /* from phase 1 or existing lookup */;
  
  // Mark parent
  await supabase.from("menu_items")
    .update({ is_parent: true })
    .eq("id", parentId);
  
  for (const ingredientName of item.ingredients) {
    // Find or create component
    let componentId = existingMenuItemsByName.get(normalize(ingredientName));
    if (!componentId) {
      const { data } = await supabase.from("menu_items").insert({
        name: ingredientName,
        station: "line",
        unit: "portions",
        is_parent: false,
      }).select("id").single();
      componentId = data.id;
    }
    
    // Create BOM link
    await supabase.from("menu_item_components").upsert({
      parent_item_id: parentId,
      component_item_id: componentId,
      quantity_per_serving: 1,
    }, { onConflict: "parent_item_id,component_item_id" });
  }
}
```

### Step 6: Update `generate-prep-list` Edge Function

Rewrite the Golden Formula to "explode" parent sales into component usage:

1. Fetch `menu_item_components` to build a BOM lookup
2. For each sale, check if the sold item `is_parent`
   - If yes: multiply `quantity_sold * quantity_per_serving` for each component
   - If no (standalone): treat as today (direct prep)
3. Aggregate total usage per component across all parents
4. Apply Golden Formula per component (not per parent)
5. Only insert components (and standalone items) into `prep_list_items` -- never parent items

```text
Example:
  Caesar Salad sold 4, Half Caesar sold 2
  Caesar Dressing is component of both (qty_per_serving = 1)
  
  Component Usage:
    Caesar Dressing = (4 * 1) + (2 * 1) = 6
    Romaine = (4 * 1) + (2 * 1) = 6
    Crispy Parm = (4 * 1) = 4 (only in full Caesar)
  
  Golden Formula for Caesar Dressing:
    Yesterday Par = 10, Usage = 6
    Stock On Hand = max(0, 10 - 6) = 4
    Today Par = 10
    Prep Needed = 10 - 4 = 6
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| Database migration (SQL) | Create | `menu_item_components` table + `is_parent` column |
| `src/components/admin/UnifiedImportWizard.tsx` | Modify | Extract A3:A23 ingredients, 3-phase import |
| `supabase/functions/generate-prep-list/index.ts` | Modify | BOM explosion in Golden Formula |

## Edge Cases

- **Ingredient name matches existing menu item**: Uses the existing record (no duplicate created)
- **Ingredient appears in multiple parent items**: Same component links to multiple parents -- usage aggregates correctly
- **Standalone items** (no ingredients in A3:A23): Behave exactly like today -- no BOM, direct prep calculation
- **Empty cells in A3:A23**: Skipped (only non-empty, non-whitespace values extracted)
- **"(See Recipe)" in ingredient cell**: Strip the suffix and match/create the component by name, then also link it to its recipe if one exists
- **Quantity per serving defaults to 1**: Editable later via an admin Component Linking UI (future enhancement)

