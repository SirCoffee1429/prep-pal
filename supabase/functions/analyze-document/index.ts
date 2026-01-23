import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, inferStation } from "../_shared/utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, fileName } = await req.json();

    if (!fileContent) {
      return errorResponse("No file content provided", 400);
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY not configured");
      return errorResponse("Gemini API key not configured", 500);
    }

    const systemPrompt = `You are an expert restaurant data parser. Analyze this file content.

First, **identify** the document type:
- "recipe" - Production Spec sheets with ingredients, method, costs
- "menu_item" - Food cost spreadsheets with category, price, margins
- "par_sheet" - Par level documents with stock quantities
- "sales_report" - Item sales reports with quantities sold

Then, **extract** the data according to the type:

For RECIPE:
{
  "type": "recipe",
  "data": {
    "recipes": [
      {
        "name": "Recipe Name",
        "ingredients": [{ "item": "...", "quantity": "...", "measure": "...", "unit_cost": 0, "total_cost": 0 }],
        "method": "Assembly steps...",
        "recipe_cost": 0,
        "portion_cost": 0,
        "menu_price": 0,
        "food_cost_percent": 0
      }
    ]
  }
}

For MENU_ITEM:
{
  "type": "menu_item",
  "data": {
    "menu_items": [
      {
        "category": "ENTREES",
        "name": "Item Name",
        "menu_price": 0,
        "food_cost": 0,
        "cost_percent": 0,
        "gross_margin": 0,
        "gross_margin_percent": 0
      }
    ]
  }
}

For PAR_SHEET:
{
  "type": "par_sheet",
  "data": {
    "items": [{ "name": "...", "par_quantity": 0, "day_of_week": null, "unit": "portions" }],
    "has_multiple_days": false,
    "detected_days": []
  }
}

For SALES_REPORT:
{
  "type": "sales_report",
  "data": {
    "items": [{ "item_name": "...", "quantity": 0 }]
  }
}

Return ONLY valid JSON. Do not wrap in markdown code blocks.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt },
                { text: `Analyze this file "${fileName}":\n\n${fileContent}` }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      
      if (response.status === 429) {
        return errorResponse("Rate limit exceeded. Please try again later.", 429);
      }
      if (response.status === 401 || response.status === 403) {
        return errorResponse("Invalid Gemini API key", 401);
      }
      return errorResponse(`Gemini API error: ${response.status}`, 500);
    }

    const geminiResponse = await response.json();
    console.log("Gemini response:", JSON.stringify(geminiResponse, null, 2));
    
    const textContent = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      console.error("No content in Gemini response:", geminiResponse);
      return errorResponse("AI did not return content", 500);
    }

    // Parse JSON from response
    let parsedData;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : textContent.trim();
      parsedData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response:", textContent);
      return errorResponse("Failed to parse AI response as JSON", 500);
    }

    // Add inferred stations for menu items
    if (parsedData.type === "menu_item" && parsedData.data?.menu_items) {
      parsedData.data.menu_items = parsedData.data.menu_items.map((item: any) => ({
        ...item,
        inferred_station: inferStation(item.name, item.category),
      }));
    }

    // Add inferred stations for recipes
    if (parsedData.type === "recipe" && parsedData.data?.recipes) {
      parsedData.data.recipes = parsedData.data.recipes.map((recipe: any) => ({
        ...recipe,
        inferred_station: inferStation(recipe.name),
      }));
    }

    return jsonResponse(parsedData);
  } catch (error) {
    console.error("Error in analyze-document:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
