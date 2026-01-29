import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, inferStation } from "../_shared/utils.ts";

/**
 * Unified document analyzer using Google Gemini API directly
 * - PDFs: Uses gemini-2.5-pro for vision/layout understanding
 * - Text (CSV/Excel): Uses gemini-2.5-flash for speed and cost efficiency
 * 
 * Auto-detects document type: recipe, menu_item, par_sheet, sales
 */

type DocumentType = "recipe" | "menu_item" | "par_sheet" | "sales" | "unknown";

interface AnalyzeRequest {
  fileContent: string;
  mimeType: string;
  fileName?: string;
  menuItems?: string[]; // For sales matching
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, mimeType, fileName, menuItems }: AnalyzeRequest = await req.json();

    if (!fileContent) {
      return errorResponse("No file content provided", 400);
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY not configured");
      return errorResponse("AI service not configured", 500);
    }

    // Hybrid model selection based on file type
    const isPDF = mimeType === "application/pdf";
    const model = isPDF ? "gemini-2.5-pro-preview-05-06" : "gemini-2.5-flash-preview-05-20";
    
    console.log(`Processing ${fileName || "document"} with ${model} (mimeType: ${mimeType})`);

    // Build menu items reference for sales matching
    const menuItemsList = menuItems?.length 
      ? `\n\nKnown menu items in the system for matching: ${menuItems.join(", ")}`
      : "";

    const systemPrompt = `You are an expert restaurant data parser for The Club at Old Hawthorne kitchen.

TASK:
1. First, identify the document type based on its content structure:
   - "sales" - POS sales reports with "Item" and "Units Sold" columns
   - "par_sheet" - Par level documents with target stock quantities by day
   - "recipe" - Recipe/Production Spec cards with ingredients, method, and costs
   - "menu_item" - Food cost spreadsheets with menu pricing and cost analysis

2. Extract the relevant data based on document type.

DOCUMENT TYPE IDENTIFICATION RULES:

SALES REPORT indicators:
- Has columns: Item, Units Sold, Sales, Discounts, Net Sales
- Items grouped by category (Appetizers, BBQ, Dinner Entrees, etc.)
- Contains "Item Category Totals:" rows

PAR SHEET indicators:
- Contains "Par" column or day-of-week columns (Mon, Tue, Wed, etc.)
- Lists items with target quantities (stock levels)
- May have units like "portions", "each", "pan", "qt"

RECIPE indicators:
- Contains "PRODUCTION SPEC" or "RECIPE" in headers
- Has ingredient lists with quantities, measures, and costs
- May include method/instructions, portion costs

MENU ITEM indicators:
- Contains columns: Category, Item Name, Menu Price, Food Cost, Cost %
- Financial data like Gross Margin
- Categories: APPS, BBQ, ENTREES, HANDHELDS, etc.
${menuItemsList}

OUTPUT FORMAT:
Return a JSON object with this exact structure:
{
  "type": "sales" | "par_sheet" | "recipe" | "menu_item" | "unknown",
  "data": { ... type-specific data ... }
}

DATA SCHEMAS BY TYPE:

For "sales":
{
  "items": [
    { "name": "Item Name", "quantity": 5, "original_name": "Name from report" }
  ]
}
Note: "quantity" is Units Sold (integer, NOT dollar sales). Skip modifiers, totals, Open Food.

For "par_sheet":
{
  "items": [
    { "name": "Item Name", "par_quantity": 10, "day_of_week": null, "unit": "portions" }
  ],
  "has_multiple_days": false,
  "detected_days": []
}
Note: day_of_week: 0=Sunday through 6=Saturday. null if single "Par" column.

For "recipe":
{
  "recipes": [
    {
      "name": "Recipe Name",
      "ingredients": [
        { "item": "Ingredient", "quantity": "2", "measure": "oz", "unit_cost": 0.50, "total_cost": 1.00 }
      ],
      "method": "Prep instructions...",
      "recipe_cost": 5.50,
      "portion_cost": 2.75,
      "menu_price": 14.99,
      "food_cost_percent": 18.35,
      "inferred_station": "grill"
    }
  ]
}

For "menu_item":
{
  "menu_items": [
    {
      "category": "ENTREES",
      "name": "Item Name",
      "menu_price": 24.99,
      "food_cost": 6.50,
      "cost_percent": 26.0,
      "gross_margin": 18.49,
      "gross_margin_percent": 74.0,
      "inferred_station": "grill"
    }
  ]
}

STATION INFERENCE RULES:
- Fried/Wings/Fries/Tots/Breaded → "fry"
- Salad/Caesar/Greens/Slaw → "salad"
- Pasta/Risotto/Alfredo → "saute"
- Steak/Burger/Grilled/Salmon → "grill"
- Sauces/Sides/Other → "line"`;

    // Build request body based on file type
    let requestBody: any;
    
    if (isPDF) {
      // For PDFs, use vision with inline data
      requestBody = {
        contents: [{
          role: "user",
          parts: [
            { text: `${systemPrompt}\n\nAnalyze this document (${fileName || "document.pdf"}) and extract the data.` },
            { inlineData: { mimeType: "application/pdf", data: fileContent } }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      };
    } else {
      // For text content (CSV/Excel extracted text)
      requestBody = {
        contents: [{
          role: "user",
          parts: [
            { text: `${systemPrompt}\n\nAnalyze this document (${fileName || "document.csv"}):\n\n${fileContent}` }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      
      if (response.status === 429) {
        return errorResponse("Rate limit exceeded. Please try again in a moment.", 429);
      }
      if (response.status === 400) {
        return errorResponse("Invalid request to AI service.", 400);
      }
      
      return errorResponse("Failed to process with AI", 500);
    }

    const aiResponse = await response.json();
    
    // Check for API-specific errors in response body
    if (aiResponse.error) {
      console.error("Gemini API error in response:", aiResponse.error);
      return errorResponse(`AI error: ${aiResponse.error.message || "Unknown error"}`, 500);
    }

    // Extract content from Gemini response format
    const content = aiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      console.error("No content in Gemini response:", JSON.stringify(aiResponse));
      throw new Error("AI did not return any content");
    }

    // Parse JSON from response
    let parsedData;
    try {
      // Handle potential markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
      parsedData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse document data from AI response");
    }

    // Validate response structure
    if (!parsedData.type || !parsedData.data) {
      console.error("Invalid response structure:", parsedData);
      throw new Error("Invalid response structure from AI");
    }

    // Enrich with station inference for menu_item and recipe types
    if (parsedData.type === "menu_item" && parsedData.data.menu_items) {
      parsedData.data.menu_items = parsedData.data.menu_items.map((item: any) => ({
        ...item,
        inferred_station: item.inferred_station || inferStation(item.name, item.category),
      }));
    }

    if (parsedData.type === "recipe" && parsedData.data.recipes) {
      parsedData.data.recipes = parsedData.data.recipes.map((recipe: any) => ({
        ...recipe,
        inferred_station: recipe.inferred_station || inferStation(
          recipe.name,
          undefined,
          recipe.ingredients?.map((i: any) => i.item)
        ),
      }));
    }

    console.log(`Successfully parsed as ${parsedData.type}: ${
      parsedData.type === "menu_item" ? parsedData.data.menu_items?.length :
      parsedData.type === "recipe" ? parsedData.data.recipes?.length :
      parsedData.type === "par_sheet" ? parsedData.data.items?.length :
      parsedData.type === "sales" ? parsedData.data.items?.length :
      0
    } items`);

    return jsonResponse(parsedData);
  } catch (error) {
    console.error("Error analyzing document:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to analyze document", 500);
  }
});
