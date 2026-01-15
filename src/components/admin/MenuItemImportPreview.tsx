import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, UtensilsCrossed, DollarSign, ChefHat } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type KitchenStation = Database["public"]["Enums"]["kitchen_station"];

export interface ParsedIngredient {
  item: string;
  quantity: string;
  measure?: string;
  unit_cost?: number;
  total_cost?: number;
}

export interface ParsedMenuItem {
  name: string;
  ingredients: ParsedIngredient[];
  method?: string;
  recipe_cost?: number;
  portion_cost?: number;
  menu_price?: number;
  food_cost_percent?: number;
  inferred_station: string;
}

interface MenuItemImportPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuItems: ParsedMenuItem[];
  existingRecipes: { id: string; name: string }[];
  onImport: (items: Array<ParsedMenuItem & { station: KitchenStation }>) => Promise<void>;
  isImporting: boolean;
}

const STATIONS: { value: KitchenStation; label: string }[] = [
  { value: "grill", label: "Grill" },
  { value: "saute", label: "Sauté" },
  { value: "fry", label: "Fry" },
  { value: "salad", label: "Salad" },
  { value: "line", label: "Line" },
];

const MenuItemImportPreview = ({
  open,
  onOpenChange,
  menuItems,
  existingRecipes,
  onImport,
  isImporting,
}: MenuItemImportPreviewProps) => {
  const [selectedItems, setSelectedItems] = useState<Set<number>>(
    new Set(menuItems.map((_, i) => i))
  );
  const [stationOverrides, setStationOverrides] = useState<Record<number, KitchenStation>>({});

  // Reset selections when menuItems change
  useEffect(() => {
    setSelectedItems(new Set(menuItems.map((_, i) => i)));
    setStationOverrides({});
  }, [menuItems]);

  const toggleItem = (index: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedItems(newSelected);
  };

  const toggleAll = () => {
    if (selectedItems.size === menuItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(menuItems.map((_, i) => i)));
    }
  };

  const getStation = (index: number): KitchenStation => {
    return stationOverrides[index] || (menuItems[index].inferred_station as KitchenStation) || "line";
  };

  const setStation = (index: number, station: KitchenStation) => {
    setStationOverrides((prev) => ({ ...prev, [index]: station }));
  };

  const handleImport = async () => {
    const itemsToImport = menuItems
      .filter((_, i) => selectedItems.has(i))
      .map((item, originalIndex) => {
        const actualIndex = menuItems.indexOf(item);
        return {
          ...item,
          station: getStation(actualIndex),
        };
      });
    await onImport(itemsToImport);
  };

  const formatCurrency = (value?: number) => {
    if (value === undefined || value === null) return "-";
    return `$${value.toFixed(2)}`;
  };

  const findExistingRecipe = (name: string) => {
    return existingRecipes.find(
      (r) => r.name.toLowerCase().trim() === name.toLowerCase().trim()
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5" />
            Import Menu Items
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between py-2 border-b">
          <span className="text-sm text-muted-foreground">
            Found {menuItems.length} item{menuItems.length !== 1 ? "s" : ""} in file
          </span>
          <Button variant="ghost" size="sm" onClick={toggleAll}>
            {selectedItems.size === menuItems.length ? "Deselect All" : "Select All"}
          </Button>
        </div>

        <ScrollArea className="max-h-[50vh] pr-4">
          <Accordion type="multiple" className="space-y-2">
            {menuItems.map((item, index) => {
              const existingRecipe = findExistingRecipe(item.name);
              return (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="border rounded-lg px-4"
                >
                  <div className="flex items-center gap-3 py-2">
                    <Checkbox
                      checked={selectedItems.has(index)}
                      onCheckedChange={() => toggleItem(index)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <AccordionTrigger className="flex-1 hover:no-underline">
                      <div className="flex items-center gap-2 text-left flex-1">
                        <span className="font-medium">{item.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {item.ingredients?.length || 0} ingredients
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={getStation(index)}
                        onValueChange={(v) => setStation(index, v as KitchenStation)}
                      >
                        <SelectTrigger className="w-28 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATIONS.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <AccordionContent className="pb-4">
                    <div className="space-y-4 pl-7">
                      {/* Recipe Status */}
                      <div className="flex items-center gap-2">
                        <ChefHat className="h-4 w-4 text-muted-foreground" />
                        {existingRecipe ? (
                          <span className="text-sm text-muted-foreground">
                            Links to existing recipe: <strong>{existingRecipe.name}</strong>
                          </span>
                        ) : (
                          <span className="text-sm text-green-600">
                            Creates new recipe: <strong>{item.name}</strong>
                          </span>
                        )}
                      </div>

                      {/* Cost Stats */}
                      <div className="flex flex-wrap gap-4 text-sm">
                        {item.recipe_cost !== undefined && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <DollarSign className="h-3.5 w-3.5" />
                            Cost: {formatCurrency(item.recipe_cost)}
                          </div>
                        )}
                        {item.menu_price !== undefined && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <DollarSign className="h-3.5 w-3.5" />
                            Menu: {formatCurrency(item.menu_price)}
                          </div>
                        )}
                        {item.food_cost_percent !== undefined && (
                          <Badge
                            variant={item.food_cost_percent <= 30 ? "default" : "secondary"}
                          >
                            {item.food_cost_percent.toFixed(1)}% food cost
                          </Badge>
                        )}
                      </div>

                      {/* Ingredients */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Ingredients</h4>
                        <div className="grid gap-1 text-sm">
                          {item.ingredients?.slice(0, 6).map((ing, i) => (
                            <div
                              key={i}
                              className="flex justify-between text-muted-foreground"
                            >
                              <span>{ing.item}</span>
                              <span>
                                {ing.quantity} {ing.measure}
                              </span>
                            </div>
                          ))}
                          {item.ingredients && item.ingredients.length > 6 && (
                            <span className="text-muted-foreground text-xs">
                              +{item.ingredients.length - 6} more...
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Method Preview */}
                      {item.method && (
                        <div>
                          <h4 className="text-sm font-medium mb-1">Method</h4>
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {item.method}
                          </p>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={selectedItems.size === 0 || isImporting}
          >
            {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Import {selectedItems.size} Item{selectedItems.size !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MenuItemImportPreview;
