import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";

interface Ingredient {
  item: string;
  quantity: string;
  measure?: string;
  unit_cost?: number;
  total_cost?: number;
}

interface Recipe {
  id: string;
  name: string;
  ingredients: Ingredient[] | null;
  method: string | null;
  file_url: string | null;
  yield_amount: string | null;
  yield_measure: string | null;
  recipe_cost: number | null;
}

interface RecipeModalProps {
  recipeId: string | null;
  onClose: () => void;
}

const formatCurrency = (value: number | null | undefined) => {
  if (value == null) return "-";
  return `$${value.toFixed(2)}`;
};

const RecipeModal = ({ recipeId, onClose }: RecipeModalProps) => {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (recipeId) {
      fetchRecipe();
    } else {
      setRecipe(null);
    }
  }, [recipeId]);

  const fetchRecipe = async () => {
    if (!recipeId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .eq("id", recipeId)
        .maybeSingle();

      if (error) throw error;
      
      // Parse ingredients if it's a string
      if (data) {
        let parsedIngredients: Ingredient[] | null = null;
        if (data.ingredients) {
          if (typeof data.ingredients === 'string') {
            parsedIngredients = JSON.parse(data.ingredients);
          } else if (Array.isArray(data.ingredients)) {
            parsedIngredients = data.ingredients as unknown as Ingredient[];
          }
        }
        
        const parsedRecipe: Recipe = {
          id: data.id,
          name: data.name,
          ingredients: parsedIngredients,
          method: data.method,
          file_url: data.file_url,
          yield_amount: data.yield_amount,
          yield_measure: data.yield_measure,
          recipe_cost: data.recipe_cost ? Number(data.recipe_cost) : null,
        };
        setRecipe(parsedRecipe);
      }
    } catch (error) {
      console.error("Error fetching recipe:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const hasYieldInfo = recipe?.yield_amount || recipe?.yield_measure;
  const hasRecipeCost = recipe?.recipe_cost != null;

  return (
    <Dialog open={!!recipeId} onOpenChange={() => onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden bg-recipe-bg text-recipe-foreground">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : recipe ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">
                {recipe.name}
              </DialogTitle>
            </DialogHeader>

            <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
              {/* Yield & Cost Summary */}
              {(hasYieldInfo || hasRecipeCost) && (
                <div className="mb-6 rounded-lg bg-muted/50 p-4">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    {hasYieldInfo && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-muted-foreground">Yields:</span>
                        <span className="font-semibold">
                          {recipe.yield_amount} {recipe.yield_measure}
                        </span>
                      </div>
                    )}
                    {hasYieldInfo && hasRecipeCost && (
                      <span className="text-muted-foreground">•</span>
                    )}
                    {hasRecipeCost && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-muted-foreground">Recipe Cost:</span>
                        <span className="font-semibold text-primary">
                          {formatCurrency(recipe.recipe_cost)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Ingredients Table */}
              {recipe.ingredients && recipe.ingredients.length > 0 && (
                <div className="mb-6">
                  <h4 className="mb-3 text-lg font-semibold">Ingredients</h4>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="font-semibold">Item</TableHead>
                          <TableHead className="w-20 text-right font-semibold">Qty</TableHead>
                          <TableHead className="w-24 font-semibold">Measure</TableHead>
                          <TableHead className="w-24 text-right font-semibold">Unit $</TableHead>
                          <TableHead className="w-24 text-right font-semibold">Total $</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recipe.ingredients.map((ing, idx) => (
                          <TableRow key={idx} className="even:bg-muted/20">
                            <TableCell className="font-medium">{ing.item}</TableCell>
                            <TableCell className="text-right">{ing.quantity}</TableCell>
                            <TableCell>{ing.measure || "-"}</TableCell>
                            <TableCell className="text-right">{formatCurrency(ing.unit_cost)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(ing.total_cost)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Assembly (Method) */}
              {recipe.method && (
                <div className="mb-6">
                  <Separator className="mb-4" />
                  <h4 className="mb-3 text-lg font-semibold">Assembly</h4>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {recipe.method}
                  </div>
                </div>
              )}

              {/* File Link */}
              {recipe.file_url && (
                <div className="mt-4">
                  <a
                    href={recipe.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline hover:no-underline"
                  >
                    View Original Recipe File
                  </a>
                </div>
              )}
            </ScrollArea>
          </>
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            Recipe not found
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RecipeModal;
