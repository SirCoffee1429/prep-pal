

## Make Prep List Items Clickable for Recipe Details

### Problem Identified
Looking at the screenshot and code, the prep list items (like "BBQ Combo Platter", "Brisket Platter", etc.) are currently **not clickable**. Only a small BookOpen icon button on the right side opens the recipe modal - and this button only appears when the menu item has a linked recipe.

The user wants the **entire item row to be tappable** to view recipe details.

---

### Solution

Make the entire `PrepListItem` card clickable to trigger the recipe modal, providing a much larger touch target that's kitchen-friendly.

---

### Implementation

#### 1. Update PrepListItem Component

**File:** `src/components/prep/PrepListItem.tsx`

**Changes:**
- Make the entire card clickable (not just the book icon)
- Add cursor pointer and hover states
- Keep the status button separate (clicking it still cycles status)
- Remove the separate BookOpen button (entire card now does this)

```tsx
// Before: Card with separate recipe button
<Card className="flex items-center gap-4...">
  <button onClick={cycleStatus}>...</button>
  <div className="flex-1">...</div>
  {hasRecipe && <Button onClick={onViewRecipe}>...</Button>}
</Card>

// After: Clickable card with stopPropagation on status button
<Card 
  onClick={onViewRecipe}
  className="flex items-center gap-4 cursor-pointer hover:bg-accent/50..."
>
  <button 
    onClick={(e) => { e.stopPropagation(); cycleStatus(); }}
  >...</button>
  <div className="flex-1">...</div>
  <BookOpen className="h-6 w-6 text-muted-foreground" /> {/* Visual hint */}
</Card>
```

#### 2. Update PrepDashboard to Handle Missing Recipes

**File:** `src/pages/PrepDashboard.tsx`

**Changes:**
- Pass the `menu_item_id` along with `recipe_id` to the modal
- Allow opening modal even without a recipe to show "No recipe available" message

#### 3. Update RecipeModal to Handle Missing Recipes

**File:** `src/components/prep/RecipeModal.tsx`

**Changes:**
- Accept both `recipeId` and optional `menuItemName` props
- Show a friendly message when no recipe is linked
- Still display the modal so users get feedback on their click

---

### File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/prep/PrepListItem.tsx` | UPDATE | Make entire card clickable, add hover state, use stopPropagation on status button |
| `src/pages/PrepDashboard.tsx` | UPDATE | Pass menu item name to modal for "no recipe" state |
| `src/components/prep/RecipeModal.tsx` | UPDATE | Handle case when no recipe exists, show friendly message |

---

### UX Improvements

| Before | After |
|--------|-------|
| Only small book icon clickable | Entire card is tappable |
| No feedback if no recipe | Shows "No recipe available" message |
| Icon hidden if no recipe | Card always shows book icon hint |
| Harder to tap on tablets | Kitchen-friendly large touch target |

---

### Technical Notes

**Touch Target:**
- The entire card becomes a 60px+ tall touch target
- Status button uses `e.stopPropagation()` to prevent opening modal when cycling status

**Visual Feedback:**
- `cursor-pointer` added to card
- `hover:bg-accent/50` provides hover feedback
- BookOpen icon always visible as a hint that details are available

