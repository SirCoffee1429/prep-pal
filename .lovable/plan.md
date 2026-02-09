

## Overview
Enhance the Par Sheet Import dialog to allow creating new menu items on-the-fly when an imported item doesn't match any existing menu item. Currently, unmatched items can only be linked to existing menu items via a dropdown. This change will allow users to select unmatched items, edit their name, specify their type (Menu Item or Recipe), and assign a station.

## Current Behavior vs. New Behavior

```text
CURRENT:
+------------------------------------------+
| Chicken Breast                           |
| [!] [Select item...      v]  Par: [10]   |
|     ^ Disabled checkbox if no match      |
+------------------------------------------+

NEW:
+------------------------------------------+
| [x] Chicken Breast                       |
|     [Select existing...  v]              |
|     -- OR Create New --                  |
|     Name: [Chicken Breast    ]           |
|     Type: [Menu Item  v]                 |
|     Station: [Grill  v]                  |
|     Par: [10]                            |
+------------------------------------------+
```

## Technical Approach
Extend the `ReviewItem` interface to track "create new" fields and update the UI to show creation options for unmatched items. During import, first create any new menu items, then upsert par levels.

## Implementation Steps

### 1. Extend the ReviewItem Interface
Add new fields to track the "create new" state:
```typescript
interface ReviewItem extends ParsedItem {
  selected: boolean;
  matchResult: MatchResult;
  manualMatchId: string | null;
  editedQuantity: number;
  // New fields for creating new items
  createNew: boolean;
  editedName: string;
  newItemType: "menu_item" | "recipe";
  newItemStation: KitchenStation;
}
```

### 2. Update STATIONS Constant
Add the stations array (matching MenuItemManagement pattern):
```typescript
const STATIONS: { value: KitchenStation; label: string }[] = [
  { value: "grill", label: "Grill" },
  { value: "saute", label: "Sauté" },
  { value: "fry", label: "Fry" },
  { value: "salad", label: "Salad" },
  { value: "line", label: "Line" },
];
```

### 3. Update Import Types
Import the `KitchenStation` type from the database types file.

### 4. Initialize ReviewItem with New Fields
When parsing items, initialize the new fields:
```typescript
const reviews: ReviewItem[] = parsedItems.map((item) => {
  const matchResult = findBestMatch(item.name, menuItems);
  return {
    ...item,
    selected: matchResult.confidence !== "none",
    matchResult,
    manualMatchId: null,
    editedQuantity: item.par_quantity,
    // New fields
    createNew: false,
    editedName: item.name,
    newItemType: "menu_item",
    newItemStation: "grill",
  };
});
```

### 5. Add Helper Functions for New Item Creation
```typescript
// Toggle create new mode
const toggleCreateNew = (index: number, createNew: boolean) => {
  setReviewItems((prev) =>
    prev.map((item, i) =>
      i === index
        ? {
            ...item,
            createNew,
            selected: createNew ? true : item.selected,
            manualMatchId: createNew ? null : item.manualMatchId,
          }
        : item
    )
  );
};

// Update edited name
const updateEditedName = (index: number, name: string) => {
  setReviewItems((prev) =>
    prev.map((item, i) => (i === index ? { ...item, editedName: name } : item))
  );
};

// Update new item type
const updateNewItemType = (index: number, type: "menu_item" | "recipe") => {
  setReviewItems((prev) =>
    prev.map((item, i) => (i === index ? { ...item, newItemType: type } : item))
  );
};

// Update new item station
const updateNewItemStation = (index: number, station: KitchenStation) => {
  setReviewItems((prev) =>
    prev.map((item, i) => (i === index ? { ...item, newItemStation: station } : item))
  );
};
```

### 6. Update the isSelectable Logic
Allow selection when either matched OR creating new:
```typescript
const canSelect = (item: ReviewItem): boolean => {
  return !!getMenuItemId(item) || item.createNew;
};
```

### 7. Update the Import Handler
Modify `handleImport` to first create new menu items, then upsert par levels:
```typescript
const handleImport = async () => {
  const itemsToImport = reviewItems.filter(
    (item) => item.selected && (getMenuItemId(item) || item.createNew)
  );
  // ...
  
  // Phase 1: Create new menu items
  const newItemsToCreate = itemsToImport.filter((item) => item.createNew);
  const createdItemsMap = new Map<number, string>(); // index -> new menu_item_id
  
  for (let i = 0; i < newItemsToCreate.length; i++) {
    const item = newItemsToCreate[i];
    const originalIndex = reviewItems.indexOf(item);
    
    // Create menu item
    const { data, error } = await supabase
      .from("menu_items")
      .insert({
        name: item.editedName.trim(),
        station: item.newItemStation,
        unit: "portions",
      })
      .select("id")
      .single();
    
    if (error) {
      // Handle error, show toast
      continue;
    }
    
    createdItemsMap.set(originalIndex, data.id);
    
    // Also create recipe if type is "recipe"
    if (item.newItemType === "recipe") {
      await supabase.from("recipes").insert({ name: item.editedName.trim() });
    }
  }
  
  // Phase 2: Upsert par levels
  const upserts = itemsToImport.map((item) => {
    const originalIndex = reviewItems.indexOf(item);
    const menuItemId = item.createNew
      ? createdItemsMap.get(originalIndex)
      : getMenuItemId(item);
    
    return {
      menu_item_id: menuItemId!,
      day_of_week: importDay,
      par_quantity: item.editedQuantity,
    };
  }).filter((u) => u.menu_item_id);
  // ...
};
```

### 8. Update the UI for Unmatched Items
For items with `confidence === "none"`, show:
- Toggle between "Select existing" and "Create new"
- When "Create new" is active, show editable fields for name, type, and station
- Checkbox becomes enabled when "Create new" is toggled on

```text
UI Structure for Unmatched Item:
+----------------------------------------------------+
| [x] Original Name from Par Sheet                   |
|                                                    |
|     [Select existing...  v]  [+ Create New]        |
|                                                    |
|     -- OR when Create New is clicked --            |
|                                                    |
|     Name:    [________________]                    |
|     Type:    [Menu Item  v]                        |
|     Station: [Grill      v]                        |
|                                          Par: [10] |
+----------------------------------------------------+
```

## Files to Modify
- `src/components/admin/ParSheetImportDialog.tsx`

## Edge Cases Handled
1. **Duplicate names**: If user tries to create an item with a name that already exists, the insert will fail due to the unique constraint on `menu_items.name`. Show an appropriate error toast.
2. **Empty name**: Validate that `editedName` is not empty before allowing import.
3. **Switching modes**: When user toggles between "Select existing" and "Create new", clear the other mode's selection.

## Preserved Functionality
- All existing match/fuzzy match logic (unchanged)
- Day of week selection (unchanged)
- Par quantity editing (unchanged)
- Select All Matched toggle (unchanged)
- Import progress and toast notifications (unchanged)

