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

    const systemPrompt = `You are a professional recipe and menu item parser for a country club kitchen. You extract structured menu item data from Production Spec spreadsheet content.

The spreadsheet follows this format:
- Row 1: "Production Spec For: [Menu Item Name]"
- Ingredients table with columns: Item, Quantity, Measure, Unit Cost, Total Cost
- "Assembly:" section with numbered method steps
- Cost information: Recipe Cost, Portion Cost, Menu Price, Food Cost %

IMPORTANT: The content may contain MULTIPLE sheets/items. Each sheet starts with "=== Sheet: [name] ===" separator. Parse ALL items from ALL sheets.

For each menu item found, extract:
1. name: The menu item name from "Production Spec For:" (this becomes both the menu item and recipe name)
2. ingredients: Array of {item, quantity, measure, unit_cost, total_cost}
3. method: The assembly/method steps as a single string
4. recipe_cost: Total recipe cost as number
5. portion_cost: Cost per portion as number
6. menu_price: Menu selling price as number
7. food_cost_percent: Food cost percentage as number

Return a JSON object with a "menu_items" array containing all parsed items.`;

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
          { role: "user", content: `Parse all menu items from this Production Spec spreadsheet file "${fileName}":\n\n${fileContent}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_menu_items",
              description: "Extract all menu items from the Production Spec spreadsheet",
              parameters: {
                type: "object",
                properties: {
                  menu_items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Menu item name" },
                        ingredients: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              item: { type: "string" },
                              quantity: { type: "string" },
                              measure: { type: "string" },
                              unit_cost: { type: "number" },
                              total_cost: { type: "number" },
                            },
                            required: ["item", "quantity"],
                          },
                        },
                        method: { type: "string", description: "Assembly/method steps" },
                        recipe_cost: { type: "number" },
                        portion_cost: { type: "number" },
                        menu_price: { type: "number" },
                        food_cost_percent: { type: "number" },
                      },
                      required: ["name", "ingredients"],
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

    // Check for error in AI response (e.g., timeout 524)
    if (aiResponse.error) {
      console.error("AI returned error:", aiResponse.error);
      const errorCode = aiResponse.error.code;
      
      if (errorCode === 524) {
        return errorResponse("AI request timed out. Try uploading a smaller file or fewer sheets.", 504);
      }
      
      return errorResponse(aiResponse.error.message || "AI processing failed", 500);
    }

    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in response");
      return errorResponse("AI did not return structured data. Please try again.", 500);
    }

    const parsedData = JSON.parse(toolCall.function.arguments);
    
    // Add inferred station to each menu item
    const menuItemsWithStation = parsedData.menu_items.map((item: any) => ({
      ...item,
      inferred_station: inferStation(
        item.name,
        undefined,
        item.ingredients?.map((i: any) => i.item) || []
      ),
    }));
    
    return jsonResponse({ menu_items: menuItemsWithStation });
  } catch (error) {
    console.error("Error parsing menu items:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
