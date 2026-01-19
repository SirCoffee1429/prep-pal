/**
 * Shared utilities for Supabase Edge Functions
 */

// CORS headers used by all edge functions
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// JSON response helper
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Error response helper
export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

// Handle common AI Gateway errors consistently
export function handleAIError(status: number, errorText: string): Response {
  console.error("AI Gateway error:", status, errorText);
  
  if (status === 429) {
    return errorResponse("Rate limit exceeded. Please try again in a moment.", 429);
  }
  if (status === 402) {
    return errorResponse("AI service credits exhausted.", 402);
  }
  if (status === 524) {
    return errorResponse("AI request timed out. Try uploading a smaller file.", 504);
  }
  
  return errorResponse("Failed to process with AI", 500);
}

// Category-to-Station base mapping
const CATEGORY_STATION_MAP: Record<string, string> = {
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

/**
 * Unified station inference logic based on item name, category, and ingredients
 */
export function inferStation(
  name: string,
  category?: string,
  ingredients?: string[]
): string {
  const lowerName = name.toLowerCase();
  const ingredientText = (ingredients || []).join(" ").toLowerCase();

  // Fry overrides (highest priority)
  if (
    /fried|fry|wings|rings|fries|curds|tendies|tots|crispy|breaded|tempura/i.test(lowerName) ||
    /fried|fry|breaded/.test(ingredientText)
  ) {
    return "fry";
  }

  // Salad overrides
  if (/salad|caesar|greens|slaw|cole|greek|asian|house/i.test(lowerName)) {
    return "salad";
  }

  // Saute overrides
  if (
    /pasta|risotto|sauteed|saute|pan|alfredo|rav|mostaccioli|fett/i.test(lowerName) ||
    /pasta|risotto/.test(ingredientText)
  ) {
    return "saute";
  }

  // Grill overrides
  if (
    /steak|sirloin|ribeye|filet|strip|burger|grilled|char|bavette|salmon|shrimp/i.test(lowerName) ||
    /steak|sirloin|ribeye|bavette/.test(ingredientText)
  ) {
    return "grill";
  }

  // Category-based fallback
  if (category) {
    return CATEGORY_STATION_MAP[category.toUpperCase().trim()] || "line";
  }

  return "line";
}
