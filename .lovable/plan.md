

## End-to-End Test Suite for Prep Master

### Overview
Set up a complete testing infrastructure and write tests covering all major features: utility functions, component rendering, admin dashboard navigation, and edge function logic.

### Setup (New Files)

**1. Test configuration and setup files:**
- `vitest.config.ts` - Vitest config with jsdom, path aliases, and setup file
- `src/test/setup.ts` - Jest-DOM matchers and window.matchMedia mock
- Update `tsconfig.app.json` to add `"vitest/globals"` to types
- Install dev dependencies: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`

### Test Files

**2. `src/lib/itemMatching.test.ts` - Fuzzy Matching Logic (8 tests)**
- Exact case-insensitive match returns confidence "exact"
- Normalized match strips oz prefixes (e.g., "8oz Ribeye" matches "Ribeye")
- Preserves "Half" and "Full" prefixes as distinct items
- Fuzzy match via word overlap returns confidence "fuzzy"
- Returns confidence "none" when no match found
- Empty input returns no match
- `getConfidenceColor` and `getConfidenceLabel` return correct values

**3. `src/lib/fileClassification.test.ts` - File Classification Logic (10 tests)**
- `classifyByA1("MENU ITEM")` returns "menu_item"
- `classifyByA1("RECIPE")` returns "recipe"
- `classifyByA1("PAR")` returns "par_sheet"
- `classifyByA1("SALES")` returns "sales"
- `classifyByA1("random text")` returns "unknown"
- `classifySheet` falls back to position for multi-sheet workbooks (first = menu_item, rest = recipe)
- `classifyContent` detects sales reports by keyword "ITEM SALES REPORT"
- `generateContentHash` produces consistent hashes
- `areDuplicates` detects duplicates by hash
- `areDuplicates` returns false for dissimilar content

**4. `src/pages/Index.test.tsx` - Home Page (3 tests)**
- Renders "Prep Master" title
- Renders Admin and Staff buttons
- Admin button navigates to /admin (dev mode)

**5. `src/pages/AdminDashboard.test.tsx` - Admin Dashboard (4 tests)**
- Renders without requiring login (auth bypassed)
- Shows all 4 tab triggers: Par Levels, Recipes, Sales Data, Menu Items
- Defaults to Par Levels tab
- Shows header with "Prep Master" and "Admin Dashboard"

**6. `src/components/prep/PrepListItem.test.tsx` - Prep List Item (4 tests)**
- Renders item name, quantity, and unit
- Shows correct status icon for open/in_progress/completed
- Cycles status on button click (open -> in_progress -> completed -> open)
- Applies line-through styling when completed

**7. `supabase/functions/generate-prep-list/index.test.ts` - Prep List Edge Function (3 tests)**
- Returns 200 with valid salesDate
- Returns error on malformed request
- Correctly calls the endpoint (integration-level)

### Test Count Summary

| Area | Tests |
|------|-------|
| Item Matching (utility) | 8 |
| File Classification (utility) | 10 |
| Home Page (component) | 3 |
| Admin Dashboard (component) | 4 |
| Prep List Item (component) | 4 |
| Edge Function (integration) | 3 |
| **Total** | **32** |

### Technical Details

**Mocking strategy:**
- Supabase client will be mocked via `vi.mock("@/integrations/supabase/client")` for component tests
- React Router will be mocked for navigation assertions
- Pure utility tests (itemMatching, fileClassification) need no mocks
- Edge function tests will call the deployed function directly using fetch

**File changes:**
| File | Action |
|------|--------|
| `vitest.config.ts` | Create |
| `src/test/setup.ts` | Create |
| `tsconfig.app.json` | Edit (add vitest/globals type) |
| `src/lib/itemMatching.test.ts` | Create |
| `src/lib/fileClassification.test.ts` | Create |
| `src/pages/Index.test.tsx` | Create |
| `src/pages/AdminDashboard.test.tsx` | Create |
| `src/components/prep/PrepListItem.test.tsx` | Create |
| `supabase/functions/generate-prep-list/index.test.ts` | Create |

