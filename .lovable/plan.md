
## Overview
Reorganize the Menu Items tab to display items grouped by their kitchen station in expandable folder-like sections. Each station (Grill, Saute, Fry, Salad, Line) will have its own collapsible folder containing only the menu items assigned to that station.

## Visual Design
```text
+---------------------------------------+
| Menu Items                            |
| [Delete All] [Unified Import] [+ Add] |
+---------------------------------------+
|                                       |
| > Grill (12 items)                    |
|   +----------------------------+      |
|   | Name | Unit | Recipe | ... |      |
|   |--------------------------- |      |
|   | Ribeye Steak | portions | ..      |
|   | Chicken Breast | portions | ..    |
|   +----------------------------+      |
|                                       |
| > Saute (8 items)                     |
|   [collapsed]                         |
|                                       |
| > Fry (15 items)                      |
|   [collapsed]                         |
|                                       |
| > Salad (10 items)                    |
|   [collapsed]                         |
|                                       |
| > Line (5 items)                      |
|   [collapsed]                         |
+---------------------------------------+
```

## Technical Approach
Use the existing shadcn Accordion component (`src/components/ui/accordion.tsx`) to create expandable station folders. Each folder will contain a table of menu items for that specific station.

## Implementation Steps

### 1. Update MenuItemManagement.tsx
- Import Accordion components from `@/components/ui/accordion`
- Add Folder icon from `lucide-react`
- Group menu items by station using a useMemo hook:
  ```typescript
  const groupedByStation = useMemo(() => {
    return STATIONS.map(station => ({
      ...station,
      items: menuItems.filter(item => item.station === station.value)
    }));
  }, [menuItems]);
  ```

### 2. Replace Flat Table with Accordion Structure
- Replace the single `<Table>` with an `<Accordion type="multiple">` allowing multiple folders open at once
- Each station becomes an `<AccordionItem>`:
  - Trigger shows station name + item count (e.g., "Grill (12 items)")
  - Content shows a table of items for that station only

### 3. Styling for Kitchen UI
- Add folder icon next to each station name
- Show item count badge
- Keep existing edit/delete functionality per row
- Ensure touch-friendly targets (60px+ height)

## Files to Modify
- `src/components/admin/MenuItemManagement.tsx`

## Preserved Functionality
- Add/Edit/Delete individual menu items (unchanged)
- Delete All button (unchanged)
- Import from Excel (unchanged)
- Unified Import wizard (unchanged)
- All existing form fields and validation (unchanged)
