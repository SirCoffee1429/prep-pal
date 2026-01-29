

## Switch from Lovable AI Gateway to Google Gemini API Directly

### Current State vs. Proposed

| Current | Proposed |
|---------|----------|
| Uses `LOVABLE_API_KEY` | Uses `GEMINI_API_KEY` |
| Gateway: `ai.gateway.lovable.dev` | Direct: `generativelanguage.googleapis.com` |
| Subject to Lovable credit limits | Uses your own Google API quota |
| 402 errors when credits exhausted | Independent billing via Google Cloud |

---

### Edge Functions to Update

Two edge functions currently use the Lovable AI Gateway:

1. **`supabase/functions/analyze-document/index.ts`** - Unified document parser (PDF/CSV/Excel)
2. **`supabase/functions/parse-sales/index.ts`** - Sales report parser

---

### Technical Changes

#### 1. Update `analyze-document/index.ts`

**Change API key reference:**
```typescript
// Before
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

// After
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
if (!GEMINI_API_KEY) {
  return errorResponse("GEMINI_API_KEY not configured", 500);
}
```

**Change endpoint and model names:**
```typescript
// Before
const model = isPDF ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash";
await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
  headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
  body: JSON.stringify({ model, ... })
});

// After
const model = isPDF ? "gemini-2.5-pro-preview-05-06" : "gemini-2.5-flash-preview-05-20";
await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    contents: [...],
    generationConfig: { responseMimeType: "application/json" }
  })
});
```

**Update request body format** (Google API uses different structure):
```typescript
// Google Gemini API format
{
  contents: [
    { role: "user", parts: [{ text: systemPrompt + "\n\n" + userContent }] }
  ],
  generationConfig: {
    responseMimeType: "application/json",
    temperature: 0.1
  }
}

// For PDFs with vision:
{
  contents: [{
    role: "user",
    parts: [
      { text: "Analyze this document..." },
      { inlineData: { mimeType: "application/pdf", data: base64Content } }
    ]
  }]
}
```

---

#### 2. Update `parse-sales/index.ts`

Same pattern - switch from `LOVABLE_API_KEY` to `GEMINI_API_KEY` and update the API endpoint/format.

---

### Google Gemini Model Mapping

| Lovable Gateway Model | Direct Google API Model |
|----------------------|-------------------------|
| `google/gemini-2.5-pro` | `gemini-2.5-pro-preview-05-06` |
| `google/gemini-2.5-flash` | `gemini-2.5-flash-preview-05-20` |
| `google/gemini-3-flash-preview` | `gemini-2.5-flash-preview-05-20` |

---

### File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/analyze-document/index.ts` | UPDATE | Switch to Google Gemini API directly using `GEMINI_API_KEY` |
| `supabase/functions/parse-sales/index.ts` | UPDATE | Switch to Google Gemini API directly using `GEMINI_API_KEY` |

---

### Benefits

- No more 402 "credits exhausted" errors from Lovable
- Use your own Google Cloud billing/quota
- Direct control over API costs
- Same Gemini models, just accessed directly

