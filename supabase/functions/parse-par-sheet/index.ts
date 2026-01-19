import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, handleAIError } from "../_shared/utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, fileName, menuItems, isBase64 } = await req.json();

    if (!fileContent) {
      return errorResponse("No file content provided", 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build menu items reference for the AI
    const menuItemsList = menuItems?.length > 0
      ? `\n\nKnown menu items in the system:\n${menuItems.map((m: { name: string }) => `- ${m.name}`).join("\n")}`
      : "";

    const systemPrompt = `You are a par sheet data extractor for a kitchen management system. Your job is to parse par level documents (Excel exports, CSVs, or PDFs) and extract item names with their target par quantities.

DOCUMENT FORMAT:
- Par sheets list menu items with target stock levels
- Items may have quantities for different days of the week
- Quantities may include units like "portions", "each", "pan", "qt", etc.
- Column headers might include day names (Mon, Tue, Wed, etc.) or just "Par"

EXTRACTION RULES:
1. Extract the item name exactly as written
2. Extract the par quantity as a number (convert fractions like "1/2" to decimals)
3. If multiple days are present, extract each day separately
4. Ignore items with zero or empty quantities
5. If units are specified, include them

OUTPUT FORMAT:
Return a JSON object with this structure:
{
  "items": [
    {
      "name": "Item Name",
      "par_quantity": 10,
      "day_of_week": null,
      "unit": "portions"
    }
  ],
  "has_multiple_days": false,
  "detected_days": []
}

IMPORTANT:
- day_of_week should be: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
- If the sheet has a single "Par" column with no day specification, set day_of_week to null
- If multiple days detected, has_multiple_days should be true and detected_days should list the day numbers${menuItemsList}`;

    // Prepare user content based on file type
    let userContent: any[];
    if (isBase64 && fileName?.toLowerCase().endsWith(".pdf")) {
      userContent = [
        {
          type: "file",
          file: {
            filename: fileName,
            file_data: `data:application/pdf;base64,${fileContent}`,
          },
        },
        {
          type: "text",
          text: `Extract par level data from this par sheet document: ${fileName}`,
        },
      ];
    } else {
      userContent = [
        {
          type: "text",
          text: `Extract par level data from this par sheet content:\n\nFile: ${fileName}\n\n${fileContent}`,
        },
      ];
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
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return handleAIError(response.status, errorText);
    }

    const aiResponse = await response.json();
    
    // Check for AI-specific errors
    if (aiResponse.error) {
      const errorCode = aiResponse.error?.code;
      if (errorCode === 524) {
        return errorResponse("AI request timed out. Try uploading a smaller file.", 504);
      }
      throw new Error(`AI error: ${JSON.stringify(aiResponse.error)}`);
    }

    const content = aiResponse.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("AI did not return any content");
    }

    // Parse JSON from the response
    let parsedData;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
      parsedData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse par sheet data from AI response");
    }

    // Validate the response structure
    if (!parsedData.items || !Array.isArray(parsedData.items)) {
      throw new Error("Invalid response structure from AI");
    }

    return jsonResponse(parsedData);
  } catch (error) {
    console.error("Error processing par sheet:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to process par sheet", 500);
  }
});
