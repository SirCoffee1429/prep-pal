

## Fix: Duplicate Items in Sales Data Save

### Problem Identified
The error `"ON CONFLICT DO UPDATE command cannot affect row a second time"` occurs when the parsed sales data contains duplicate `menu_item_id` entries. This happens when:
1. The sales report lists the same item multiple times (e.g., in different categories)
2. Multiple parsed items get matched to the same menu item

When trying to upsert an array with duplicates, Postgres fails because it cannot update the same row twice in a single command.

### Solution
Aggregate duplicate items **before** sending to the database. Combine quantities for items with the same `menu_item_id`.

---

### Implementation

**File:** `src/components/admin/SalesUpload.tsx`

Update the `handleSaveSalesData` function to aggregate duplicates:

```typescript
const handleSaveSalesData = async () => {
  const matchedItems = parsedItems.filter((item) => item.matched_item_id);
  if (matchedItems.length === 0) {
    toast({
      title: "No matched items",
      description: "No items could be matched to your menu",
      variant: "destructive",
    });
    return;
  }

  setIsUploading(true);
  try {
    // Aggregate duplicates: combine quantities for same menu_item_id
    const aggregatedMap = new Map<string, number>();
    matchedItems.forEach((item) => {
      const id = item.matched_item_id!;
      const existing = aggregatedMap.get(id) || 0;
      aggregatedMap.set(id, existing + item.quantity);
    });

    // Convert aggregated data to array format
    const salesData = Array.from(aggregatedMap.entries()).map(([menu_item_id, quantity_sold]) => ({
      menu_item_id,
      sales_date: salesDate,
      quantity_sold,
    }));

    const { error } = await supabase.from("sales_data").upsert(salesData, {
      onConflict: "menu_item_id,sales_date",
    });

    if (error) throw error;

    toast({
      title: "Success",
      description: `Saved sales data for ${salesData.length} unique items`,
    });

    setFile(null);
    setParsedItems([]);
  } catch (error) {
    console.error("Save error:", error);
    toast({
      title: "Error",
      description: "Failed to save sales data",
      variant: "destructive",
    });
  } finally {
    setIsUploading(false);
  }
};
```

---

### Changes Summary

| File | Change |
|------|--------|
| `src/components/admin/SalesUpload.tsx` | Add aggregation logic to combine duplicate menu_item_ids before upserting |

---

### Technical Details

**Before (failing):**
```javascript
salesData = [
  { menu_item_id: "abc", sales_date: "2024-01-22", quantity_sold: 3 },
  { menu_item_id: "abc", sales_date: "2024-01-22", quantity_sold: 2 }, // DUPLICATE - causes error
]
```

**After (fixed):**
```javascript
salesData = [
  { menu_item_id: "abc", sales_date: "2024-01-22", quantity_sold: 5 }, // Combined: 3 + 2
]
```

