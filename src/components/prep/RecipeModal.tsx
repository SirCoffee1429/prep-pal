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
import { Loader2 } from "lucide-react";

interface Recipe {
  id: string;
  name: string;
  ingredients: { item: string; quantity: string }[] | null;
  method: string | null;
  plating_notes: string | null;
  file_url: string | null;
}

interface RecipeModalProps {
  recipeId: string | null;
  onClose: () => void;
}

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
        const parsedRecipe: Recipe = {
          ...data,
          ingredients: data.ingredients 
            ? (typeof data.ingredients === 'string' 
                ? JSON.parse(data.ingredients) 
                : data.ingredients as { item: string; quantity: string }[])
            : null,
        };
        setRecipe(parsedRecipe);
      }
    } catch (error) {
      console.error("Error fetching recipe:", error);
    } finally {
      setIsLoading(false);
    }
  };

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
              {/* Ingredients */}
              {recipe.ingredients && recipe.ingredients.length > 0 && (
                <div className="mb-6">
                  <h4 className="mb-3 text-lg font-semibold">Ingredients</h4>
                  <ul className="space-y-2">
                    {recipe.ingredients.map((ing, idx) => (
                      <li key={idx} className="flex justify-between border-b border-border/30 pb-2">
                        <span>{ing.item}</span>
                        <span className="font-medium text-primary">{ing.quantity}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Method */}
              {recipe.method && (
                <div className="mb-6">
                  <Separator className="mb-4" />
                  <h4 className="mb-3 text-lg font-semibold">Method</h4>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {recipe.method}
                  </div>
                </div>
              )}

              {/* Plating Notes */}
              {recipe.plating_notes && (
                <div className="mb-6">
                  <Separator className="mb-4" />
                  <h4 className="mb-3 text-lg font-semibold">Plating Notes</h4>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {recipe.plating_notes}
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
