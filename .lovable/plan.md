

## Enhanced Recipe Details Modal for Staff Prep List

### Overview
Update the `RecipeModal` component to display comprehensive recipe information when staff click on prep list items, providing kitchen staff with all details needed to properly prepare each item.

---

### Fields to Display

| Field | Description |
|-------|-------------|
| Recipe Name | Header title |
| Yield Amount + Yield Measure | e.g., "Yields: 2 Quarts" |
| Recipe Cost | Total cost formatted as currency |
| Ingredients Table | Item, Quantity, Measure, Unit Cost, Total Cost |
| Assembly (Method) | Step-by-step preparation instructions |
| File URL | Link to original recipe document |

**Removed:** Plating Notes (per user request)

---

### UI Layout

```text
┌──────────────────────────────────────────────────┐
│ Recipe Name                              [Close] │
├──────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────┐ │
│ │ Yields: 2 Quarts  •  Recipe Cost: $24.50     │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ INGREDIENTS                                      │
│ ┌────────────┬─────┬───────┬────────┬─────────┐ │
│ │ Item       │ Qty │ Measure│ Unit $ │ Total $ │ │
│ ├────────────┼─────┼───────┼────────┼─────────┤ │
│ │ Butter     │ 4   │ oz    │ $0.50  │ $2.00   │ │
│ │ Heavy Cream│ 2   │ cups  │ $3.00  │ $6.00   │ │
│ └────────────┴─────┴───────┴────────┴─────────┘ │
│                                                  │
│ ASSEMBLY                                         │
│ 1. Melt butter in a saucepan...                 │
│ 2. Add cream and simmer...                      │
│                                                  │
│ [View Original Recipe File]                      │
└──────────────────────────────────────────────────┘
```

---

### Implementation

**File:** `src/components/prep/RecipeModal.tsx`

**Changes:**

1. **Expand interfaces** to include all recipe fields:
   ```typescript
   interface Ingredient {
     item: string;
     quantity: string;
     measure?: string;
     unit_cost?: number;
     total_cost?: number;
   }
   
   interface Recipe {
     id: string;
     name: string;
     ingredients: Ingredient[] | null;
     method: string | null;
     file_url: string | null;
     yield_amount: string | null;
     yield_measure: string | null;
     recipe_cost: number | null;
   }
   ```

2. **Add currency formatting helper**:
   ```typescript
   const formatCurrency = (value: number | null | undefined) => {
     if (value == null) return "-";
     return `$${value.toFixed(2)}`;
   };
   ```

3. **Add Yield and Cost Summary** - styled info card below header showing yield and total recipe cost

4. **Replace simple ingredients list with a table** containing columns:
   - Item (name)
   - Qty (quantity)
   - Measure (unit like oz, cups)
   - Unit $ (unit_cost)
   - Total $ (total_cost)

5. **Rename "Method" section to "Assembly"**

6. **Remove Plating Notes section entirely**

---

### File Changes Summary

| File | Action |
|------|--------|
| `src/components/prep/RecipeModal.tsx` | UPDATE - Expand Recipe interface, add yield/cost summary, enhance ingredients table, rename Method to Assembly, remove Plating Notes |

