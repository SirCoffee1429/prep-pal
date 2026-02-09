

## Overview
Reorganize the Par Levels tab to display items grouped by kitchen station in expandable folder-like sections, matching the pattern we just implemented for Menu Items. Each station (Grill, Saute, Fry, Salad, Line) will have its own collapsible folder containing the par level inputs for items in that station.

## Visual Design
```text
+-----------------------------------------------+
| Par Levels                                    |
| Set target stock levels for each menu item... |
+-----------------------------------------------+
| [Day Dropdown] [Delete All] [Import] [Save]   |
+-----------------------------------------------+
|                                               |
| > Grill (12 items)                            |
|   +--------------------------------+          |
|   | Item | Unit | Par Level       |          |
|   |--------------------------------|          |
|   | Ribeye Steak | portions | [8] |          |
|   | Chicken | portions | [12]     |          |
|   +--------------------------------+          |
|                                               |
| > Saute (8 items)                             |
|   [collapsed]                                 |
|                                               |
| > Fry (15 items)                              |
|   [collapsed]                                 |
|                                               |
| > Salad (10 items)                            |
|   [collapsed]                                 |
|                                               |
| > Line (5 items)                              |
|   [collapsed]                                 |
+-----------------------------------------------+
```

## Technical Approach
Use the same shadcn Accordion component pattern from MenuItemManagement. Remove the station filter dropdown since items are now grouped by station automatically.

## Implementation Steps

### 1. Update Imports
- Import Accordion components from `@/components/ui/accordion`
- Import Badge from `@/components/ui/badge`
- Add Folder icon from `lucide-react`
- Add useMemo from React

### 2. Group Items by Station
Add a useMemo hook to group menu items:
```typescript
const groupedByStation = useMemo(() => {
  return STATIONS.map((station) => ({
    ...station,
    items: menuItems.filter((item) => item.station === station.value),
  }));
}, [menuItems]);
```

### 3. Remove Station Filter Dropdown
Since items are now organized by station folders, the station filter dropdown becomes redundant and will be removed. Only the day-of-week dropdown remains for selecting which day's par levels to view/edit.

### 4. Replace Flat Table with Accordion Structure
- Replace the single `<Table>` with `<Accordion type="multiple">`
- Each station becomes an `<AccordionItem>`:
  - Trigger shows: Folder icon + Station name + Item count badge
  - Content shows a table with columns: Item, Unit, Par Level (input)
- The "Station" column is removed from the table since items are already grouped by station

### 5. Styling for Kitchen UI
- Add folder icon next to each station name
- Show item count badge with station-appropriate styling
- Ensure touch-friendly input fields (keep existing w-24 input size)
- Match the visual styling from MenuItemManagement accordion

## Files to Modify
- `src/components/admin/ParManagement.tsx`

## Preserved Functionality
- Day of week selection dropdown (unchanged)
- Par level input fields per item (unchanged)
- Save Changes button with dirty state tracking (unchanged)
- Delete All button with confirmation dialog (unchanged)
- Import Par Sheet button and dialog (unchanged)
- Real-time par value updates via the changes Map (unchanged)

