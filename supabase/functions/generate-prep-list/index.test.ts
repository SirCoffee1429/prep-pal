import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/generate-prep-list`;

Deno.test("generate-prep-list: returns 200 with valid salesDate", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ salesDate: "2025-01-15" }),
  });
  const body = await response.json();
  assertEquals(response.status, 200);
  assertExists(body.success);
  assertExists(body.itemCount);
  assertExists(body.date);
});

Deno.test("generate-prep-list: returns 500 on malformed request (no body)", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: "not json",
  });
  const body = await response.text();
  assertEquals(response.status, 500);
  assertExists(body);
});

Deno.test("generate-prep-list: handles missing salesDate gracefully (uses today)", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({}),
  });
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.success, true);
});
