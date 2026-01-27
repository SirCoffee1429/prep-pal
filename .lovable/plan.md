

## Add PDF Support to Unified Import Wizard

### Overview
The backend `analyze-document` edge function already supports PDF files with vision-based AI processing. The frontend `UnifiedImportWizard` needs to be updated to accept and properly handle PDF uploads.

---

### Current vs. Proposed

| Current | Proposed |
|---------|----------|
| File input accepts: `.csv,.xlsx,.xls` | File input accepts: `.csv,.xlsx,.xls,.pdf` |
| PDF files rejected by browser | PDF files accepted and processed |
| Only text-based parsing | PDF converted to Base64 for vision AI |

---

### File Changes

#### Update UnifiedImportWizard Component

**File:** `src/components/admin/UnifiedImportWizard.tsx`

**Changes:**

1. **Update file input accept attribute** (line 239):
```typescript
// Before
accept=".csv,.xlsx,.xls"

// After
accept=".csv,.xlsx,.xls,.pdf"
```

2. **Update help text** (line 234):
```typescript
// Before
<p>Supports multiple .xlsx, .xls, or .csv files</p>

// After
<p>Supports Excel, CSV, and PDF files</p>
```

3. **Add PDF handling branch in file processing** (around line 57):
```typescript
// Add new condition for PDF files
if (file.name.toLowerCase().endsWith(".pdf")) {
  // Convert PDF to Base64 (strip data URL prefix)
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  const base64Content = btoa(binary);

  // Send to analyze-document with PDF mimeType
  const { data, error } = await supabase.functions.invoke("analyze-document", {
    body: {
      fileContent: base64Content,
      fileName: file.name,
      mimeType: "application/pdf",
    },
  });

  // Process response (menu_items and recipes)
  if (!error && data?.data?.menu_items) {
    // Map to ParsedItem[]
  }
  if (!error && data?.data?.recipes) {
    // Map to ParsedItem[]
  }
  processedCount++;
}
```

---

### Technical Flow

```text
User drops PDF file
       │
       ▼
┌──────────────────────────┐
│ Convert to ArrayBuffer   │
│ → Uint8Array → Base64    │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ Call analyze-document    │
│ mimeType: application/pdf│
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ Edge function uses       │
│ gemini-2.5-pro (vision)  │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ Return parsed items      │
│ (recipes/menu_items)     │
└──────────────────────────┘
```

---

### File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/admin/UnifiedImportWizard.tsx` | UPDATE | Add `.pdf` to accept attribute, add PDF→Base64 conversion logic, update help text |

---

### Why This Works

The `analyze-document` edge function already handles PDFs:
- Line 40-41: Detects PDF by mimeType and selects `gemini-2.5-pro`
- Line 154-166: Constructs vision-compatible message with Base64 image data
- The AI model extracts text and structure from PDF images

The only missing piece was the frontend accepting and encoding PDFs correctly.

