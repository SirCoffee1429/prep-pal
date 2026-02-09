

## Overview
Add duplicate detection to the Par Sheet Import review step. When the uploaded par sheet contains multiple items with the same name, they will be flagged with a visual "Duplicate" badge and users can remove duplicates individually.

## What Changes

When items are parsed from the par sheet, the system will check for duplicate names (case-insensitive) within the batch. Duplicate items get:
- A yellow "Duplicate" badge next to their name
- A delete/remove button to dismiss one of the duplicates from the list

```text
+----------------------------------------------------+
| [x] Chicken Breast                                |
|     -> Chicken Breast   Par: [10]                  |
|                                                    |
| [x] Chicken Breast              [Duplicate] [X]   |
|     -> Chicken Breast   Par: [8]                   |
+----------------------------------------------------+
```

## Technical Approach
All changes in `src/components/admin/ParSheetImportDialog.tsx`:

### 1. Detect Duplicates After Parsing
After building the `reviews` array, scan for items sharing the same normalized name (case-insensitive, trimmed). Mark duplicates with a computed flag.

### 2. Add a `isDuplicate` Computed Check
Create a helper function that checks if an item's name appears more than once in the review list:
```typescript
const getDuplicateIndices = (items: ReviewItem[]): Set<number> => {
  const nameCount = new Map<string, number[]>();
  items.forEach((item, i) => {
    const key = item.name.toLowerCase().trim();
    nameCount.set(key, [...(nameCount.get(key) || []), i]);
  });
  const dupes = new Set<number>();
  nameCount.forEach((indices) => {
    if (indices.length > 1) indices.forEach((i) => dupes.add(i));
  });
  return dupes;
};
```

### 3. Add Remove Item Function
Allow users to remove a specific item from the review list:
```typescript
const removeItem = (index: number) => {
  setReviewItems((prev) => prev.filter((_, i) => i !== index));
};
```

### 4. Update the UI
- Compute `duplicateIndices` using `useMemo` on `reviewItems`
- For items flagged as duplicates, show a yellow "Duplicate" badge and a Trash/X button
- The remove button filters the item out of the `reviewItems` array

### 5. Summary Update
Show duplicate count in the summary line (e.g., "2 duplicates found").

## Files to Modify
- `src/components/admin/ParSheetImportDialog.tsx`

## Edge Cases
- Removing a duplicate recalculates the duplicate set -- if only one remains, the badge disappears
- Duplicates are detected on the original parsed name, not the edited name (for "Create New" items)
- Items matched to different existing menu items with the same parsed name are still flagged so the user can decide

