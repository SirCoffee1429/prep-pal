import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, fileName, menuItems, isBase64 } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a sales data parser for The Club at Old Hawthorne kitchen.

DOCUMENT FORMAT:
This is a POS "Item Sales Report" with columns: Item | Units Sold | Sales | Discounts | Net Sales | Tax | Svc Chg
Items are grouped by category (Appetizers, BBQ, Dinner Entrees, Handhelds, Salads, Sides, etc.)

EXTRACTION RULES:
1. Extract the "Item" name and "Units Sold" value (this is quantity sold, NOT the dollar "Sales" column)
2. Convert decimal quantities to integers by rounding (4.0 -> 4, 2.5 -> 3)
3. Only include items where Units Sold > 0

ROWS TO SKIP (do NOT include these):
- "Item Category Totals:" rows
- "Totals:" (final summary row)
- Modifiers/add-ons: "ADD SALMON", "ADD SHRIMP", "ADD STEAK", "GRILLED SALMON", "GRILLED SHRIMP"
- Service instructions: "SALAD OUT FIRST", "SALAD WITH MEAL"
- Generic items: "Open Food", "You Choose", "Birthday Dessert"
- Size modifiers when they appear alone
- Category headers without quantities

ITEM NAME MATCHING:
Try to match parsed item names to the available menu items in the system.
When matching:
- Ignore size prefixes like "6oz", "7oz", "8oz", "10 oz.", "10oz"
- "Half Caesar" should match "Caesar Salad" 
- "Full House Salad" should match "House Salad"
- Use the closest match from available menu items
- If no close match exists, return the original item name

Available menu items in the system: ${menuItems.join(", ")}

Return a JSON object with an "items" array. Each item should have:
- "name": The menu item name (try to match exactly to available menu items when possible)
- "quantity": The number sold (as an integer)
- "original_name": The original item name from the report (for reference)`;

    // Build the message content based on file type
    let userContent: any;
    if (isBase64 && fileName.toLowerCase().endsWith('.pdf')) {
      // For PDFs, send as base64 image/document
      userContent = [
        {
          type: "text",
          text: `Parse this sales report (${fileName}) and extract all menu items with their quantities sold.`
        },
        {
          type: "image_url",
          image_url: {
            url: `data:application/pdf;base64,${fileContent}`
          }
        }
      ];
    } else {
      // For text-based files (CSV, TXT, etc.)
      userContent = `Parse this sales report (${fileName}):\n\n${fileContent}`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      parsed = { items: [] };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Parse sales error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
