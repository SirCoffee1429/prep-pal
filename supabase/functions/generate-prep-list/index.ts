import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { salesDate } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const dayOfWeek = today.getDay();

    // Get all active menu items with their par levels for today
    const { data: menuItems, error: menuError } = await supabase
      .from("menu_items")
      .select(`
        id,
        name,
        par_levels!inner (
          par_quantity
        )
      `)
      .eq("is_active", true)
      .eq("par_levels.day_of_week", dayOfWeek);

    if (menuError) throw menuError;

    // Get yesterday's sales data
    const { data: salesData, error: salesError } = await supabase
      .from("sales_data")
      .select("menu_item_id, quantity_sold")
      .eq("sales_date", salesDate || todayStr);

    if (salesError) throw salesError;

    const salesMap = new Map(salesData?.map((s) => [s.menu_item_id, s.quantity_sold]) || []);

    // Calculate prep needs: Par - (Previous Par - Sales) = Par - Previous Par + Sales
    // Simplified: If we sold X, we need to prep X to maintain par
    const prepItems = menuItems
      ?.map((item) => {
        const parLevel = (item.par_levels as { par_quantity: number }[])?.[0]?.par_quantity || 0;
        const sold = salesMap.get(item.id) || 0;
        // Simple calculation: prep what was sold to get back to par
        const needed = Math.max(0, sold);
        return {
          menu_item_id: item.id,
          quantity_needed: needed,
        };
      })
      .filter((item) => item.quantity_needed > 0) || [];

    // Create or get today's prep list
    const { data: existingList } = await supabase
      .from("prep_lists")
      .select("id")
      .eq("prep_date", todayStr)
      .maybeSingle();

    let prepListId: string;

    if (existingList) {
      prepListId = existingList.id;
      // Clear existing items
      await supabase
        .from("prep_list_items")
        .delete()
        .eq("prep_list_id", prepListId);
    } else {
      const { data: newList, error: createError } = await supabase
        .from("prep_lists")
        .insert({ prep_date: todayStr })
        .select("id")
        .single();

      if (createError) throw createError;
      prepListId = newList.id;
    }

    // Insert prep items
    if (prepItems.length > 0) {
      const { error: insertError } = await supabase
        .from("prep_list_items")
        .insert(
          prepItems.map((item) => ({
            prep_list_id: prepListId,
            menu_item_id: item.menu_item_id,
            quantity_needed: item.quantity_needed,
            status: "open",
          }))
        );

      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({ success: true, itemCount: prepItems.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generate prep list error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
