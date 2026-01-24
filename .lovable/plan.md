

## Batch Recipe Import - Multiple Files at Once

### Overview
Enable importing multiple recipe files simultaneously from the Recipes tab, leveraging the existing batch import infrastructure.

---

### Current vs. Proposed

| Current | Proposed |
|---------|----------|
| Single file import only | Drag-and-drop multiple files |
| One-at-a-time workflow | Batch process all files at once |
| Basic file picker | Drop zone with progress indicators |
| No duplicate detection | Duplicate detection across files |

---

### Implementation Approach

The cleanest solution is to **integrate the UnifiedImportWizard into the Recipes tab** with a recipe-focused mode. This reuses the existing batch infrastructure.

---

### File Changes

#### 1. Update RecipeManagement Component

**File:** `src/components/admin/RecipeManagement.tsx`

**Changes:**
- Import the `UnifiedImportWizard` component
- Add state for showing the wizard
- Add a "Batch Import" button alongside the existing single-file import
- Pass the wizard a callback to refresh recipes after import

```typescript
// New state
const [showBatchImport, setShowBatchImport] = useState(false);

// New button in header (alongside existing Import Recipe button)
<Button variant="outline" onClick={() => setShowBatchImport(true)}>
  <FolderUp className="mr-2 h-4 w-4" />
  Batch Import
</Button>

// Wizard dialog
<UnifiedImportWizard
  open={showBatchImport}
  onOpenChange={setShowBatchImport}
  onComplete={fetchRecipes}
/>
```

---

### Alternative: Extend Single-File Import to Multi-File

If the user prefers to keep the simpler RecipeImportPreview flow:

#### Modify RecipeManagement.tsx

**Changes:**
- Change file input to accept `multiple` files
- Process each file through `analyze-document` 
- Aggregate all parsed recipes into a single preview dialog
- Show combined list with file source indicators

```typescript
// Update file input
<input
  ref={importInputRef}
  type="file"
  accept=".xlsx,.xls,.csv,.pdf"
  multiple  // <-- Add this
  onChange={handleImportFileSelect}
  className="hidden"
/>

// Update handler to process array of files
const handleImportFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(e.target.files || []);
  // Process each file, aggregate recipes
  // Show combined preview
};
```

---

### Recommended Approach

**Option A (Recommended): Add UnifiedImportWizard button** - Provides the full batch experience with:
- Drag-and-drop multi-file upload
- Auto-classification of file types
- Duplicate detection across files
- Progress indicators
- Per-item station/type overrides

**Option B: Extend single-file import** - Lighter change but less powerful:
- Multi-select in file picker
- Sequential processing
- Combined preview

---

### UI Changes (Option A)

The Recipes tab header will have two import options:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Recipes                                                            │
│ Manage recipe cards for your menu items                           │
│                                                                    │
│ [📑 Import Recipe]  [📁 Batch Import]  [+ Add Recipe]             │
└────────────────────────────────────────────────────────────────────┘
```

- **Import Recipe**: Existing single-file quick import
- **Batch Import**: Opens UnifiedImportWizard for multi-file drag-and-drop

---

### File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/admin/RecipeManagement.tsx` | UPDATE | Add UnifiedImportWizard integration with "Batch Import" button |

---

### Technical Notes

**Reusing Existing Infrastructure:**
- The `UnifiedImportWizard` already handles:
  - Multi-file batch uploads
  - PDF and Excel parsing
  - Auto-detection of recipes vs menu items
  - Duplicate detection against existing database records
  - Progress indicators and error handling

**No New Components Needed:**
- The wizard already supports recipe-only imports (when no menu items are detected, it creates `CombinedItem` entries from recipes)

