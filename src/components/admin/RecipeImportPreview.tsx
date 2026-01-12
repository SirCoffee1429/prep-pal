import { useState } from "react";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, ChefHat, DollarSign } from "lucide-react";

export interface ParsedIngredient {
  item: string;
  quantity: string;
  measure?: string;
  unit_cost?: number;
  total_cost?: number;
}

export interface ParsedRecipe {
  name: string;
  ingredients: ParsedIngredient[];
  method?: string;
  recipe_cost?: number;
  portion_cost?: number;
  menu_price?: number;
  food_cost_percent?: number;
}

interface RecipeImportPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipes: ParsedRecipe[];
  onImport: (recipes: ParsedRecipe[]) => Promise<void>;
  isImporting: boolean;
}

const RecipeImportPreview = ({
  open,
  onOpenChange,
  recipes,
  onImport,
  isImporting,
}: RecipeImportPreviewProps) => {
  const [selectedRecipes, setSelectedRecipes] = useState<Set<number>>(
    new Set(recipes.map((_, i) => i))
  );

  const toggleRecipe = (index: number) => {
    const newSelected = new Set(selectedRecipes);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRecipes(newSelected);
  };

  const toggleAll = () => {
    if (selectedRecipes.size === recipes.length) {
      setSelectedRecipes(new Set());
    } else {
      setSelectedRecipes(new Set(recipes.map((_, i) => i)));
    }
  };

  const handleImport = async () => {
    const recipesToImport = recipes.filter((_, i) => selectedRecipes.has(i));
    await onImport(recipesToImport);
  };

  const formatCurrency = (value?: number) => {
    if (value === undefined || value === null) return "-";
    return `$${value.toFixed(2)}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChefHat className="h-5 w-5" />
            Import Recipes
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between py-2 border-b">
          <span className="text-sm text-muted-foreground">
            Found {recipes.length} recipe{recipes.length !== 1 ? "s" : ""} in file
          </span>
          <Button variant="ghost" size="sm" onClick={toggleAll}>
            {selectedRecipes.size === recipes.length ? "Deselect All" : "Select All"}
          </Button>
        </div>

        <ScrollArea className="max-h-[50vh] pr-4">
          <Accordion type="multiple" className="space-y-2">
            {recipes.map((recipe, index) => (
              <AccordionItem
                key={index}
                value={`recipe-${index}`}
                className="border rounded-lg px-4"
              >
                <div className="flex items-center gap-3 py-2">
                  <Checkbox
                    checked={selectedRecipes.has(index)}
                    onCheckedChange={() => toggleRecipe(index)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <AccordionTrigger className="flex-1 hover:no-underline">
                    <div className="flex items-center gap-2 text-left">
                      <span className="font-medium">{recipe.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {recipe.ingredients?.length || 0} ingredients
                      </Badge>
                    </div>
                  </AccordionTrigger>
                </div>

                <AccordionContent className="pb-4">
                  <div className="space-y-4 pl-7">
                    {/* Cost Stats (Admin only) */}
                    <div className="flex flex-wrap gap-4 text-sm">
                      {recipe.menu_price !== undefined && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <DollarSign className="h-3.5 w-3.5" />
                          Menu: {formatCurrency(recipe.menu_price)}
                        </div>
                      )}
                      {recipe.food_cost_percent !== undefined && (
                        <Badge
                          variant={recipe.food_cost_percent <= 30 ? "default" : "secondary"}
                        >
                          {recipe.food_cost_percent.toFixed(1)}% food cost
                        </Badge>
                      )}
                    </div>

                    {/* Ingredients */}
                    <div>
                      <h4 className="text-sm font-medium mb-2">Ingredients</h4>
                      <div className="grid gap-1 text-sm">
                        {recipe.ingredients?.slice(0, 6).map((ing, i) => (
                          <div key={i} className="flex justify-between text-muted-foreground">
                            <span>{ing.item}</span>
                            <span>
                              {ing.quantity} {ing.measure}
                            </span>
                          </div>
                        ))}
                        {recipe.ingredients && recipe.ingredients.length > 6 && (
                          <span className="text-muted-foreground text-xs">
                            +{recipe.ingredients.length - 6} more...
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Method Preview */}
                    {recipe.method && (
                      <div>
                        <h4 className="text-sm font-medium mb-1">Method</h4>
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {recipe.method}
                        </p>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={selectedRecipes.size === 0 || isImporting}
          >
            {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Import {selectedRecipes.size} Recipe{selectedRecipes.size !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RecipeImportPreview;
