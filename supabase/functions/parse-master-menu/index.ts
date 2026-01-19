import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, handleAIError, inferStation } from "../_shared/utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, fileName } = await req.json();

    if (!fileContent) {
      return errorResponse("No file content provided", 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return errorResponse("AI service not configured", 500);
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
      return handleAIError(response.status, errorText);
    }

    const aiResponse = await response.json();
    console.log("AI Response:", JSON.stringify(aiResponse, null, 2));

    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in response");
      return errorResponse("AI did not return structured data", 500);
    }

    const parsedData = JSON.parse(toolCall.function.arguments);
    
    // Add inferred station to each menu item
    const menuItemsWithStation = parsedData.menu_items.map((item: any) => ({
      ...item,
      inferred_station: inferStation(item.name, item.category),
    }));
    
    return jsonResponse({ menu_items: menuItemsWithStation });
  } catch (error) {
    console.error("Error parsing master menu:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
