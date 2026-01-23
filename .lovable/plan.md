

## Add Searchable Dropdowns to Sales Item Matching

### Overview
Replace the standard `Select` dropdowns in the sales data matching table with searchable Combobox components. This will make it significantly easier for users to find and select the correct menu item from a potentially large list.

---

### Current vs. Proposed UX

| Current | Proposed |
|---------|----------|
| Standard dropdown - must scroll through all items | Searchable combobox with type-to-filter |
| No search capability | Search bar at top of dropdown |
| Slow for 65+ menu items | Instant filtering as you type |

---

### Implementation

#### 1. Create Reusable Combobox Component

**File:** `src/components/ui/combobox.tsx` (CREATE)

Create a reusable searchable Combobox component using the existing `Command` and `Popover` primitives:

```typescript
// Uses existing components:
// - Popover, PopoverTrigger, PopoverContent
// - Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem

interface ComboboxProps {
  options: { value: string; label: string }[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
}
```

**Features:**
- Search input at top of dropdown
- Real-time filtering as user types
- Keyboard navigation support
- "No results found" message
- Proper focus management
- Dark theme compatible styling

---

#### 2. Update SalesUpload Component

**File:** `src/components/admin/SalesUpload.tsx` (UPDATE)

Replace the `Select` component in the menu item matching column with the new `Combobox`:

**Before (lines 410-428):**
```tsx
<Select
  value={item.matched_item_id || "none"}
  onValueChange={(value) => handleManualMatch(idx, value)}
>
  <SelectTrigger>...</SelectTrigger>
  <SelectContent>
    <SelectItem value="none">No match</SelectItem>
    {menuItems.map(...)}
  </SelectContent>
</Select>
```

**After:**
```tsx
<Combobox
  value={item.matched_item_id || "none"}
  onValueChange={(value) => handleManualMatch(idx, value)}
  placeholder="Select menu item..."
  searchPlaceholder="Search items..."
  emptyText="No menu items found"
  options={[
    { value: "none", label: "No match" },
    ...menuItems.map((m) => ({ value: m.id, label: m.name }))
  ]}
/>
```

---

### File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/ui/combobox.tsx` | **CREATE** | Reusable searchable combobox component |
| `src/components/admin/SalesUpload.tsx` | **UPDATE** | Replace Select with Combobox in matching table |

---

### Technical Notes

**Styling Considerations:**
- Popover content uses `bg-popover` for proper background (not transparent)
- High z-index (`z-50`) ensures dropdown appears above table
- Touch-friendly sizing for tablet use (min 44px touch targets)

**Accessibility:**
- Full keyboard navigation (arrow keys, enter, escape)
- Screen reader compatible via cmdk's built-in a11y
- Focus returns to trigger on close

**Performance:**
- cmdk handles filtering efficiently for 100+ items
- No re-renders of parent table during search

