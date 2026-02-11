

## Overview
Remove the day-of-week picker from Par Levels management. Each item will have a single par level that applies uniformly every day. The database will still use `day_of_week`, but we'll standardize on a single value (0) for all records, making the UI simpler.

## Changes

### 1. ParManagement.tsx
- Remove the `selectedDay` state, the `DAYS` constant, and the day-of-week `Select` dropdown
- Update `CardDescription` to say "Set target stock levels for each menu item"
- Fetch par levels without filtering by `day_of_week` (just grab all, keyed by `menu_item_id`)
- When saving, always upsert with `day_of_week: 0` (a fixed convention)
- Remove the `Select` import since it's no longer needed
- Remove the `ParLevel` interface (unused)

### 2. ParSheetImportDialog.tsx
- Remove the `importDay` state and the day-of-week selector from the review UI
- Always upsert par levels with `day_of_week: 0`
- Remove the `DAYS` constant
- Remove the `selectedDay` prop from the component interface
- Update the success toast to remove the day name

### 3. ParManagement.tsx (prop change)
- Stop passing `selectedDay` to `ParSheetImportDialog`

### 4. generate-prep-list Edge Function
- Simplify par lookup: instead of finding par by `yesterdayDayOfWeek` and `todayDayOfWeek`, just use the single par value (same for both since it's day-independent)
- The Golden Formula simplifies: `yesterday par == today par == the one par value`
- Remove `yesterdayDayOfWeek` and `todayDayOfWeek` variables

### 5. Database cleanup (optional data migration)
- No schema change needed (the `day_of_week` column stays)
- Existing par_levels data with different `day_of_week` values will be consolidated: we can delete all rows except `day_of_week = 0`, or pick the most common value per item

## Technical Details

**Why keep `day_of_week` in the DB?** Removing the column would require a migration, altering the unique constraint, and updating types. It's simpler to just always use `day_of_week = 0` as a convention. If day-specific pars are ever wanted again, the schema is ready.

**Edge function par lookup simplification:**
```typescript
// BEFORE: find par by specific day
const yPar = item.par_levels?.find(p => p.day_of_week === yesterdayDayOfWeek)?.par_quantity || 0;
const tPar = item.par_levels?.find(p => p.day_of_week === todayDayOfWeek)?.par_quantity || 0;

// AFTER: just use the single par value
const par = item.par_levels?.[0]?.par_quantity || 0;
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/admin/ParManagement.tsx` | Remove day picker, fetch all pars without day filter, save with `day_of_week: 0` |
| `src/components/admin/ParSheetImportDialog.tsx` | Remove `selectedDay` prop, remove day picker in review, always use `day_of_week: 0` |
| `supabase/functions/generate-prep-list/index.ts` | Simplify par lookup to use single value instead of day-specific |

