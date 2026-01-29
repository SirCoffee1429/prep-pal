import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, fileName, menuItems, isBase64 } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
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
- PRESERVE "Half" and "Full" prefixes - these are DISTINCT menu items with separate tracking
- "Half Caesar" should match "Half Caesar" exactly (NOT "Caesar")
- "Half Chicken Club" is separate from "Chicken Club"
- Size prefixes like "7oz", "8oz", "10 oz." should be preserved for matching
- Use the exact match from available menu items when possible
- If no exact match exists, return the original item name from the report

Available menu items in the system: ${menuItems.join(", ")}

Return a JSON object with an "items" array. Each item should have:
- "name": The menu item name (try to match exactly to available menu items when possible)
- "quantity": The number sold (as an integer)
- "original_name": The original item name from the report (for reference)`;

    // Build request body based on file type
    let requestBody: any;
    
    if (isBase64 && fileName.toLowerCase().endsWith('.pdf')) {
      // For PDFs, use vision with inline data
      requestBody = {
        contents: [{
          role: "user",
          parts: [
            { text: `${systemPrompt}\n\nParse this sales report (${fileName}) and extract all menu items with their quantities sold.` },
            { inlineData: { mimeType: "application/pdf", data: fileContent } }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      };
    } else {
      // For text content
      requestBody = {
        contents: [{
          role: "user",
          parts: [
            { text: `${systemPrompt}\n\nParse this sales report (${fileName}):\n\n${fileContent}` }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      };
    }

    // Use gemini-2.5-flash for sales parsing (fast and cost-effective)
    const model = "gemini-2.5-flash-preview-05-20";
    
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

    const data = await response.json();
    
    // Check for API-specific errors
    if (data.error) {
      console.error("Gemini API error in response:", data.error);
      return errorResponse(`AI error: ${data.error.message || "Unknown error"}`, 500);
    }

    // Extract content from Gemini response format
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    let parsed;
    try {
      // Handle potential markdown code blocks
      const jsonMatch = content?.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content?.trim();
      parsed = JSON.parse(jsonStr || "{}");
    } catch {
      console.error("Failed to parse AI response:", content);
      parsed = { items: [] };
    }

    return jsonResponse(parsed);
  } catch (error) {
    console.error("Parse sales error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
