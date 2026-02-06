
## Diagnosis (root cause)
The “No Menu Items Available” message is not coming from the database being empty. Your database has active menu items (79), and the app is successfully able to fetch them elsewhere (the Par Levels table is already showing items).

The actual bug is in **how `ParSheetImportDialog` triggers the fetch**:

- `ParManagement` opens the dialog by setting `open` state (`setImportDialogOpen(true)`).
- `ParSheetImportDialog` currently fetches menu items only inside `handleOpenChange(newOpen)`.
- **But `handleOpenChange` is only called when the Dialog itself requests an open-state change** (escape key, clicking overlay, internal close), not when the parent flips `open` from `false → true`.
- Result: when you open the dialog from the button, **the fetch never runs**, `menuItems` stays `[]`, and the UI shows the empty-state (“No Menu Items Available”).

This perfectly matches the screenshot: you see the empty-state (not the spinner, not an error), meaning no fetch ran.

## Fix strategy
Trigger the menu item fetch when the `open` prop becomes `true`, not only via `onOpenChange`.

We’ll add a `useEffect` watching `open`:
- When `open === true`:
  - Reset dialog state (`step`, `reviewItems`, `importDay`, `menuItemsError`)
  - Call `fetchMenuItems()`

We’ll keep `onOpenChange` as a pure “propagate to parent” handler.

## Implementation steps (code changes)
### 1) Update `src/components/admin/ParSheetImportDialog.tsx`
- Add `useEffect` import.
- Add:

  - `useEffect(() => { if (open) { ... } }, [open, selectedDay, fetchMenuItems])`

- Inside the effect when opening:
  - `setStep("upload")`
  - `setReviewItems([])`
  - `setImportDay(selectedDay)` (ensures the day defaults correctly every time)
  - `setMenuItemsError(null)`
  - call `fetchMenuItems()`

- Simplify `handleOpenChange` to:
  - `onOpenChange(newOpen)`
  - optionally clear local state on close (not required, but nice hygiene)

### 2) Verify behavior in UI
After change, opening “Import Par Sheet” should:
- briefly show “Loading menu items…” spinner
- then show the drop zone (because `menuItems.length > 0`)
- and allow file selection/drop.

## Verification checklist (“hot kitchen” pre-mortem)
What can still break and how we prevent it:

1) **Menu fetch never runs** (current bug)
   - Prevented: `useEffect` guarantees fetch on `open===true`.

2) **Dialog shows empty-state too quickly**
   - Prevented: `isLoadingItems` is set before the request; UI shows spinner instead of “No Menu Items”.

3) **Selected day mismatch**
   - Prevented: we reset `importDay` to `selectedDay` on every open.

4) **Auth / permissions issues**
   - If menu item fetch fails, new UI will show the concrete error via `menuItemsError`.

## Scope
Only frontend code changes required.
No database/RLS changes required.

## Deliverables
- One-file patch:
  - `src/components/admin/ParSheetImportDialog.tsx`
