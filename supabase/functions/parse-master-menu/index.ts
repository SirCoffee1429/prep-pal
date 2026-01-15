import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Category-to-Station mapping
function categoryToStation(category: string): string {
  const cat = category.toUpperCase().trim();
  const mapping: Record<string, string> = {
    "APPS": "fry",
    "SOUPS": "saute",
    "SALAD": "salad",
    "PROTEIN": "grill",
    "SIDES": "line",
    "HANDHELDS": "grill",
    "PASTA": "saute",
    "BBQ": "grill",
    "ENTREES": "grill",
    "SAUCES": "line",
  };
  return mapping[cat] || "line";
}

// Additional name-based station refinement
function refineStation(name: string, category: string): string {
  const lowerName = name.toLowerCase();
  const baseStation = categoryToStation(category);
  
  // Fry overrides
  if (/fried|fry|wings|rings|fries|curds|tendies|tots/i.test(lowerName)) {
    return "fry";
  }
  
  // Salad overrides
  if (/salad|slaw|caesar|greek|asian|house/i.test(lowerName) && category.toUpperCase() !== "SALAD") {
    // Only if not already salad category
    if (/salad/i.test(lowerName)) return "salad";
  }
  
  // Saute overrides
  if (/pasta|alfredo|rav|mostaccioli|fett/i.test(lowerName)) {
    return "saute";
  }
  
  // Grill overrides
  if (/steak|sirloin|ribeye|filet|strip|burger|grilled|bavette|salmon|shrimp/i.test(lowerName)) {
    return "grill";
  }
  
  return baseStation;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, fileName } = await req.json();

    if (!fileContent) {
      return new Response(
        JSON.stringify({ error: "No file content provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a professional menu data parser for a country club kitchen. You extract structured menu item data from a food cost spreadsheet.

The spreadsheet contains columns:
- Category: Food category (APPS, BBQ, ENTREES, HANDHELDS, PASTA, PROTEIN, SALAD, SAUCES, SIDES, SOUPS)
- Item Name: Menu item name
- Menu Price: Selling price
- Food Cost: Cost to make
- Cost %: Food cost percentage
- Gross Margin $: Profit per item
- Gross Margin %: Profit percentage

Extract ALL menu items from the spreadsheet. Return a JSON object with a "menu_items" array.`;

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
          { role: "user", content: `Parse all menu items from this food cost spreadsheet "${fileName}":\n\n${fileContent}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_menu_items",
              description: "Extract all menu items from the food cost spreadsheet",
              parameters: {
                type: "object",
                properties: {
                  menu_items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        category: { type: "string", description: "Food category" },
                        name: { type: "string", description: "Menu item name" },
                        menu_price: { type: "number", description: "Menu selling price" },
                        food_cost: { type: "number", description: "Cost to make" },
                        cost_percent: { type: "number", description: "Food cost percentage" },
                        gross_margin: { type: "number", description: "Profit per item" },
                        gross_margin_percent: { type: "number", description: "Profit percentage" },
                      },
                      required: ["category", "name", "menu_price", "food_cost", "cost_percent"],
                    },
                  },
                },
                required: ["menu_items"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_menu_items" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI service credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to parse menu items with AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    console.log("AI Response:", JSON.stringify(aiResponse, null, 2));

    // Extract the tool call result
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in response");
      return new Response(
        JSON.stringify({ error: "AI did not return structured data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsedData = JSON.parse(toolCall.function.arguments);
    
    // Add inferred station to each menu item
    const menuItemsWithStation = parsedData.menu_items.map((item: any) => ({
      ...item,
      inferred_station: refineStation(item.name, item.category),
    }));
    
    return new Response(
      JSON.stringify({ menu_items: menuItemsWithStation }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error parsing master menu:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
