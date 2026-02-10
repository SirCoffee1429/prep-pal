import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { salesDate } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Date Logic
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

    // 1. Fetch all menu items with par levels and is_parent flag
    const { data: menuItems, error: menuError } = await supabase
      .from("menu_items")
      .select(`id, name, is_parent, par_levels (day_of_week, par_quantity)`)
      .eq("is_active", true);

    if (menuError) throw menuError;

    // 2. Fetch BOM relationships
    const { data: bomData, error: bomError } = await supabase
      .from("menu_item_components")
      .select("parent_item_id, component_item_id, quantity_per_serving");

    if (bomError) throw bomError;

    // Build BOM lookup: parent_id -> [{component_id, qty}]
    const bomByParent = new Map<string, { component_id: string; qty: number }[]>();
    for (const row of bomData || []) {
      const entries = bomByParent.get(row.parent_item_id) || [];
      entries.push({ component_id: row.component_item_id, qty: Number(row.quantity_per_serving) });
      bomByParent.set(row.parent_item_id, entries);
    }

    // 3. Fetch Yesterday's Sales
    const { data: salesData, error: salesError } = await supabase
      .from("sales_data")
      .select("menu_item_id, quantity_sold")
      .eq("sales_date", yesterdayStr);

    if (salesError) throw salesError;

    // 4. Explode sales into component usage
    // componentUsage: component_id -> total units consumed
    const componentUsage = new Map<string, number>();

    for (const sale of salesData || []) {
      const qty = Number(sale.quantity_sold) || 0;
      const components = bomByParent.get(sale.menu_item_id);

      if (components && components.length > 0) {
        // Parent item: explode into components
        for (const comp of components) {
          const current = componentUsage.get(comp.component_id) || 0;
          componentUsage.set(comp.component_id, current + qty * comp.qty);
        }
      } else {
        // Standalone item (no BOM): usage = direct sales
        const current = componentUsage.get(sale.menu_item_id) || 0;
        componentUsage.set(sale.menu_item_id, current + qty);
      }
    }

    // Build par lookup by item
    const parByItem = new Map<string, { yesterday: number; today: number }>();
    for (const item of menuItems || []) {
      const yPar = item.par_levels?.find((p: any) => p.day_of_week === yesterdayDayOfWeek)?.par_quantity || 0;
      const tPar = item.par_levels?.find((p: any) => p.day_of_week === todayDayOfWeek)?.par_quantity || 0;
      parByItem.set(item.id, { yesterday: yPar, today: tPar });
    }

    // 5. Apply Golden Formula to components and standalone items
    // Only items that have par levels AND are NOT parents (or standalone)
    const prepItems: { menu_item_id: string; quantity_needed: number }[] = [];

    // Set of all parent item IDs (they should NOT appear on prep list)
    const parentIds = new Set(bomByParent.keys());

    for (const item of menuItems || []) {
      // Skip parent items — they don't get prepped directly
      if (parentIds.has(item.id)) continue;

      const pars = parByItem.get(item.id);
      if (!pars || pars.today === 0) continue; // No par = no prep needed

      const usage = componentUsage.get(item.id) || 0;

      // Golden Formula
      let stockOnHand = pars.yesterday - usage;
      if (stockOnHand < 0) stockOnHand = 0;

      let prepNeeded = pars.today - stockOnHand;
      if (prepNeeded < 0) prepNeeded = 0;

      if (prepNeeded > 0) {
        prepItems.push({ menu_item_id: item.id, quantity_needed: prepNeeded });
      }
    }

    console.log(`Calculated ${prepItems.length} items to prep (BOM-exploded).`);

    // 6. Upsert Prep List for TODAY
    const { data: existingList } = await supabase
      .from("prep_lists")
      .select("id")
      .eq("prep_date", todayStr)
      .maybeSingle();

    let prepListId: string;

    if (existingList) {
      prepListId = existingList.id;
      await supabase.from("prep_list_items").delete().eq("prep_list_id", prepListId);
    } else {
      const { data: newList, error: createError } = await supabase
        .from("prep_lists")
        .insert({ prep_date: todayStr })
        .select("id")
        .single();

      if (createError) throw createError;
      prepListId = newList.id;
    }

    // 7. Insert Items
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
