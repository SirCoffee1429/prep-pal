import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import PrepListItem from "@/components/prep/PrepListItem";
import RecipeModal from "@/components/prep/RecipeModal";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type KitchenStation = Database["public"]["Enums"]["kitchen_station"];
type PrepStatus = Database["public"]["Enums"]["prep_status"];

interface PrepItem {
  id: string;
  menu_item_id: string;
  quantity_needed: number;
  status: PrepStatus;
  menu_item: {
    id: string;
    name: string;
    station: KitchenStation;
    unit: string;
    recipe_id: string | null;
  };
}

const STATIONS: { value: KitchenStation; label: string }[] = [
  { value: "grill", label: "Grill" },
  { value: "saute", label: "Sauté" },
  { value: "fry", label: "Fry" },
  { value: "salad", label: "Salad" },
  { value: "line", label: "Line" },
];

const PrepDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [prepItems, setPrepItems] = useState<PrepItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState<{ recipeId: string | null; itemName: string } | null>(null);
  const [activeStation, setActiveStation] = useState<KitchenStation>("grill");

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    fetchPrepList();

    // Set up real-time subscription
    const channel = supabase
      .channel("prep_list_items_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "prep_list_items",
        },
        () => {
          fetchPrepList();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPrepList = async () => {
    try {
      // First get today's prep list
      const { data: prepList, error: prepListError } = await supabase
        .from("prep_lists")
        .select("id")
        .eq("prep_date", today)
        .maybeSingle();

      if (prepListError) throw prepListError;

      if (!prepList) {
        setPrepItems([]);
        setIsLoading(false);
        return;
      }

      // Get prep list items with menu item details
      const { data, error } = await supabase
        .from("prep_list_items")
        .select(`
          id,
          menu_item_id,
          quantity_needed,
          status,
          menu_items (
            id,
            name,
            station,
            unit,
            recipe_id
          )
        `)
        .eq("prep_list_id", prepList.id)
        .order("status", { ascending: true });

      if (error) throw error;

      // Transform data to match our interface
      const transformedData: PrepItem[] = (data || []).map((item) => ({
        id: item.id,
        menu_item_id: item.menu_item_id,
        quantity_needed: item.quantity_needed,
        status: item.status,
        menu_item: item.menu_items as PrepItem["menu_item"],
      }));

      setPrepItems(transformedData);
    } catch (error) {
      console.error("Error fetching prep list:", error);
      toast({
        title: "Error",
        description: "Failed to load prep list",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (itemId: string, newStatus: PrepStatus) => {
    try {
      const { error } = await supabase
        .from("prep_list_items")
        .update({ status: newStatus })
        .eq("id", itemId);

      if (error) throw error;

      // Optimistic update
      setPrepItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, status: newStatus } : item
        )
      );
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const getStatusCounts = (station: KitchenStation) => {
    const stationItems = prepItems.filter(
      (item) => item.menu_item?.station === station
    );
    return {
      total: stationItems.length,
      open: stationItems.filter((item) => item.status === "open").length,
      inProgress: stationItems.filter((item) => item.status === "in_progress")
        .length,
      completed: stationItems.filter((item) => item.status === "completed")
        .length,
    };
  };

  const filteredItems = prepItems.filter(
    (item) => item.menu_item?.station === activeStation
  );

  // Sort: open first, then in_progress, then completed
  const sortedItems = [...filteredItems].sort((a, b) => {
    const order = { open: 0, in_progress: 1, completed: 2 };
    return order[a.status] - order[b.status];
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading prep list...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="text-muted-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Exit
          </Button>
          <div className="text-center">
            <h1 className="font-display text-xl font-bold text-foreground">
              Prep List
            </h1>
            <p className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
          <div className="w-16" /> {/* Spacer for centering */}
        </div>
      </header>

      {/* Station Tabs */}
      <Tabs
        value={activeStation}
        onValueChange={(v) => setActiveStation(v as KitchenStation)}
        className="w-full"
      >
        <div className="border-b border-border bg-card/50 px-2">
          <TabsList className="h-14 w-full justify-start gap-1 bg-transparent p-0">
            {STATIONS.map((station) => {
              const counts = getStatusCounts(station.value);
              return (
                <TabsTrigger
                  key={station.value}
                  value={station.value}
                  className="relative flex-1 flex-col gap-0.5 rounded-none border-b-2 border-transparent px-2 py-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
                >
                  <span className="text-sm font-medium">{station.label}</span>
                  {counts.total > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {counts.completed}/{counts.total}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Prep Items */}
        <div className="p-4">
          {STATIONS.map((station) => (
            <TabsContent
              key={station.value}
              value={station.value}
              className="mt-0"
            >
              {sortedItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-lg text-muted-foreground">
                    No prep items for {station.label}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground/70">
                    Check back after sales data is uploaded
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedItems.map((item) => (
                    <PrepListItem
                      key={item.id}
                      id={item.id}
                      name={item.menu_item?.name || "Unknown"}
                      quantity={item.quantity_needed}
                      unit={item.menu_item?.unit || "portions"}
                      status={item.status}
                      onStatusChange={(newStatus) =>
                        updateStatus(item.id, newStatus)
                      }
                      onViewRecipe={() =>
                        setSelectedRecipe({
                          recipeId: item.menu_item?.recipe_id || null,
                          itemName: item.menu_item?.name || "Unknown",
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </div>
      </Tabs>

      {/* Recipe Modal */}
      <RecipeModal
        recipeId={selectedRecipe?.recipeId || null}
        itemName={selectedRecipe?.itemName}
        onClose={() => setSelectedRecipe(null)}
      />
    </div>
  );
};

export default PrepDashboard;
