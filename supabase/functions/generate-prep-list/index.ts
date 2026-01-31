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

    // Date Logic
    // If salesDate is provided, that is "Yesterday". We are prepping for "Today" (salesDate + 1 day).
    // Default: Yesterday = actual yesterday, Today = actual today.
    let yesterdayDate: Date;
    let todayDate: Date;

    if (salesDate) {
      yesterdayDate = new Date(salesDate);
      todayDate = new Date(salesDate);
      todayDate.setDate(yesterdayDate.getDate() + 1);
    } else {
      todayDate = new Date();
      yesterdayDate = new Date();
      yesterdayDate.setDate(todayDate.getDate() - 1);
    }

    const yesterdayStr = yesterdayDate.toISOString().split("T")[0];
    const todayStr = todayDate.toISOString().split("T")[0];
    const yesterdayDayOfWeek = yesterdayDate.getDay();
    const todayDayOfWeek = todayDate.getDay();

    console.log(`Generating prep list for ${todayStr}. Using sales/par from ${yesterdayStr}.`);

    // 1. Fetch Menu Items with Par Levels for BOTH days
    const { data: menuItems, error: menuError } = await supabase
      .from("menu_items")
      .select(`
        id,
        name,
        par_levels (
          day_of_week,
          par_quantity
        )
      `)
      .eq("is_active", true);

    if (menuError) throw menuError;

    // 2. Fetch Yesterday's Sales
    const { data: salesData, error: salesError } = await supabase
      .from("sales_data")
      .select("menu_item_id, quantity_sold")
      .eq("sales_date", yesterdayStr);

    if (salesError) throw salesError;

    const salesMap = new Map(salesData?.map((s: any) => [s.menu_item_id, s.quantity_sold]) || []);

    // 3. Calculate "The Golden Formula"
    const prepItems = menuItems
      ?.map((item: any) => {
        // Find pars
        const yesterdayPar: number = item.par_levels?.find((p: any) => p.day_of_week === yesterdayDayOfWeek)?.par_quantity || 0;
        const todayPar: number = item.par_levels?.find((p: any) => p.day_of_week === todayDayOfWeek)?.par_quantity || 0;

        // Sales
        const yesterdaySold: number = Number(salesMap.get(item.id)) || 0;

        // Logic: Stock_On_Hand = Yesterday_Par - Yesterday_Sold
        // (Constraint: Stock cannot be negative)
        let stockOnHand = yesterdayPar - yesterdaySold;
        if (stockOnHand < 0) stockOnHand = 0;

        // Logic: Prep_Required = Today_Par - Stock_On_Hand
        // (Constraint: Prep cannot be negative)
        let prepNeeded = todayPar - stockOnHand;
        if (prepNeeded < 0) prepNeeded = 0;

        return {
          menu_item_id: item.id,
          quantity_needed: prepNeeded,
          debug_info: {
            y_par: yesterdayPar,
            y_sold: yesterdaySold,
            stock: stockOnHand,
            t_par: todayPar
          }
        };
      })
      .filter((item: any) => item.quantity_needed > 0) || [];

    console.log(`Calculated ${prepItems.length} items to prep.`);

    // 4. Upsert Logic: Create or Update Prep List for TODAY
    const { data: existingList } = await supabase
      .from("prep_lists")
      .select("id")
      .eq("prep_date", todayStr)
      .maybeSingle();

    let prepListId: string;

    if (existingList) {
      prepListId = existingList.id;
      // Clear existing items to maintain clean state
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

    // 5. Insert Items
    if (prepItems.length > 0) {
      const { error: insertError } = await supabase
        .from("prep_list_items")
        .insert(
          prepItems.map((item: any) => ({
            prep_list_id: prepListId,
            menu_item_id: item.menu_item_id,
            quantity_needed: item.quantity_needed,
            status: "open",
          }))
        );

      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({ success: true, itemCount: prepItems.length, date: todayStr }),
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
