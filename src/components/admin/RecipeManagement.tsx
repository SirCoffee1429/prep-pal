import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, Upload, Eye, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import RecipeImportPreview, { ParsedRecipe, ParsedIngredient } from "./RecipeImportPreview";

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
  plating_notes: string | null;
  file_url: string | null;
  yield_amount?: string | null;
  yield_measure?: string | null;
  shelf_life?: string | null;
  tools?: string[] | null;
  vehicle?: string | null;
  recipe_cost?: number | null;
  portion_cost?: number | null;
  menu_price?: number | null;
  food_cost_percent?: number | null;
}

const RecipeManagement = () => {
  const { toast } = useToast();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Import state
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [parsedRecipes, setParsedRecipes] = useState<ParsedRecipe[]>([]);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [name, setName] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ item: "", quantity: "" }]);
  const [method, setMethod] = useState("");
  const [platingNotes, setPlatingNotes] = useState("");
  const [fileUrl, setFileUrl] = useState("");

  useEffect(() => {
    fetchRecipes();
  }, []);

  const fetchRecipes = async () => {
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .order("name");

      if (error) throw error;

      const transformedRecipes: Recipe[] = (data || []).map((r) => ({
        id: r.id,
        name: r.name,
        method: r.method,
        plating_notes: r.plating_notes,
        file_url: r.file_url,
        yield_amount: r.yield_amount,
        yield_measure: r.yield_measure,
        shelf_life: r.shelf_life,
        vehicle: r.vehicle,
        recipe_cost: r.recipe_cost,
        portion_cost: r.portion_cost,
        menu_price: r.menu_price,
        food_cost_percent: r.food_cost_percent,
        ingredients: r.ingredients
          ? (typeof r.ingredients === "string"
              ? JSON.parse(r.ingredients)
              : (r.ingredients as unknown as Ingredient[]))
          : null,
        tools: r.tools
          ? (Array.isArray(r.tools)
              ? r.tools as string[]
              : typeof r.tools === "string"
              ? JSON.parse(r.tools)
              : null)
          : null,
      }));

      setRecipes(transformedRecipes);
    } catch (error) {
      console.error("Error fetching recipes:", error);
      toast({
        title: "Error",
        description: "Failed to load recipes",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setIngredients([{ item: "", quantity: "" }]);
    setMethod("");
    setPlatingNotes("");
    setFileUrl("");
    setEditingRecipe(null);
  };

  const openDialog = (recipe?: Recipe) => {
    if (recipe) {
      setEditingRecipe(recipe);
      setName(recipe.name);
      setIngredients(recipe.ingredients || [{ item: "", quantity: "" }]);
      setMethod(recipe.method || "");
      setPlatingNotes(recipe.plating_notes || "");
      setFileUrl(recipe.file_url || "");
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { item: "", quantity: "" }]);
  };

  const updateIngredient = (index: number, field: "item" | "quantity", value: string) => {
    const updated = [...ingredients];
    updated[index][field] = value;
    setIngredients(updated);
  };

  const removeIngredient = (index: number) => {
    if (ingredients.length > 1) {
      setIngredients(ingredients.filter((_, i) => i !== index));
    }
  };

  // Excel import functions
  const parseExcelToText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          
          let allText = "";
          workbook.SheetNames.forEach((sheetName) => {
            const worksheet = workbook.Sheets[sheetName];
            const sheetText = XLSX.utils.sheet_to_csv(worksheet);
            allText += `\n=== Sheet: ${sheetName} ===\n${sheetText}\n`;
          });
          
          resolve(allText);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Reset input so same file can be selected again
    e.target.value = "";

    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      toast({
        title: "Invalid File",
        description: "Please select an Excel file (.xlsx or .xls)",
        variant: "destructive",
      });
      return;
    }

    setIsParsing(true);
    try {
      const fileContent = await parseExcelToText(file);
      
      const { data, error } = await supabase.functions.invoke("parse-recipe", {
        body: { fileContent, fileName: file.name },
      });

      if (error) throw error;
      
      if (!data?.recipes || data.recipes.length === 0) {
        toast({
          title: "No Recipes Found",
          description: "Could not extract any recipes from this file",
          variant: "destructive",
        });
        return;
      }

      setParsedRecipes(data.recipes);
      setShowImportPreview(true);
    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Failed to parse recipe file",
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleImportRecipes = async (recipesToImport: ParsedRecipe[]) => {
    setIsImporting(true);
    try {
      const insertData = recipesToImport.map((r) => ({
        name: r.name,
        ingredients: r.ingredients ? JSON.stringify(r.ingredients) : null,
        method: r.method || null,
        recipe_cost: r.recipe_cost || null,
        portion_cost: r.portion_cost || null,
        menu_price: r.menu_price || null,
        food_cost_percent: r.food_cost_percent || null,
      }));

      const { error } = await supabase.from("recipes").insert(insertData);
      if (error) throw error;

      toast({
        title: "Import Complete",
        description: `${recipesToImport.length} recipe${recipesToImport.length !== 1 ? "s" : ""} imported`,
      });
      
      setShowImportPreview(false);
      setParsedRecipes([]);
      fetchRecipes();
    } catch (error) {
      console.error("Error importing:", error);
      toast({
        title: "Import Failed",
        description: "Failed to save recipes to database",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("recipes")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("recipes")
        .getPublicUrl(fileName);

      setFileUrl(publicUrl);
      toast({ title: "Success", description: "File uploaded" });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Error",
        description: "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Please enter a recipe name",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const validIngredients = ingredients.filter((i) => i.item.trim() || i.quantity.trim());
      const recipeData = {
        name,
        ingredients: validIngredients.length > 0 ? JSON.stringify(validIngredients) : null,
        method: method.trim() || null,
        plating_notes: platingNotes.trim() || null,
        file_url: fileUrl.trim() || null,
      };

      if (editingRecipe) {
        const { error } = await supabase
          .from("recipes")
          .update(recipeData)
          .eq("id", editingRecipe.id);

        if (error) throw error;
        toast({ title: "Success", description: "Recipe updated" });
      } else {
        const { error } = await supabase.from("recipes").insert(recipeData);

        if (error) throw error;
        toast({ title: "Success", description: "Recipe created" });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchRecipes();
    } catch (error) {
      console.error("Error saving:", error);
      toast({
        title: "Error",
        description: "Failed to save recipe",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this recipe?")) return;

    try {
      const { error } = await supabase.from("recipes").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Success", description: "Recipe deleted" });
      fetchRecipes();
    } catch (error) {
      console.error("Error deleting:", error);
      toast({
        title: "Error",
        description: "Failed to delete recipe",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recipes</CardTitle>
          <CardDescription>
            Manage recipe cards for your menu items
          </CardDescription>
        </div>
        <div className="flex gap-2">
          {/* Hidden import input */}
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportFileSelect}
            className="hidden"
          />
          <Button variant="outline" onClick={handleImportClick} disabled={isParsing}>
            {isParsing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-2 h-4 w-4" />
            )}
            {isParsing ? "Parsing..." : "Import Recipe"}
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Add Recipe
              </Button>
            </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingRecipe ? "Edit Recipe" : "Add Recipe"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="recipeName">Recipe Name</Label>
                <Input
                  id="recipeName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Béarnaise Sauce"
                />
              </div>

              {/* Ingredients */}
              <div className="space-y-2">
                <Label>Ingredients</Label>
                {ingredients.map((ing, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      placeholder="Ingredient"
                      value={ing.item}
                      onChange={(e) => updateIngredient(idx, "item", e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Quantity"
                      value={ing.quantity}
                      onChange={(e) => updateIngredient(idx, "quantity", e.target.value)}
                      className="w-32"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeIngredient(idx)}
                      disabled={ingredients.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addIngredient}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Ingredient
                </Button>
              </div>

              {/* Method */}
              <div className="space-y-2">
                <Label htmlFor="method">Method</Label>
                <Textarea
                  id="method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  placeholder="Step-by-step instructions..."
                  rows={5}
                />
              </div>

              {/* Plating Notes */}
              <div className="space-y-2">
                <Label htmlFor="plating">Plating Notes</Label>
                <Textarea
                  id="plating"
                  value={platingNotes}
                  onChange={(e) => setPlatingNotes(e.target.value)}
                  placeholder="Presentation guidelines..."
                  rows={3}
                />
              </div>

              {/* File Upload */}
              <div className="space-y-2">
                <Label>Recipe File (Optional)</Label>
                <div className="flex gap-2">
                  <Input
                    type="file"
                    accept=".pdf,.xlsx,.xls,.doc,.docx,image/*"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
                  {isUploading && <Loader2 className="h-5 w-5 animate-spin" />}
                </div>
                {fileUrl && (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline"
                  >
                    View uploaded file
                  </a>
                )}
              </div>

              {/* Save Button */}
              <Button
                onClick={handleSave}
                className="w-full"
                disabled={isSaving}
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingRecipe ? "Update Recipe" : "Create Recipe"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Ingredients</TableHead>
              <TableHead>Has File</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No recipes yet. Add your first recipe above.
                </TableCell>
              </TableRow>
            ) : (
              recipes.map((recipe) => (
                <TableRow key={recipe.id}>
                  <TableCell className="font-medium">{recipe.name}</TableCell>
                  <TableCell>
                    {recipe.ingredients?.length || 0} items
                  </TableCell>
                  <TableCell>
                    {recipe.file_url ? (
                      <a
                        href={recipe.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-primary hover:underline"
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        View
                      </a>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDialog(recipe)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(recipe.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    
    <RecipeImportPreview
      open={showImportPreview}
      onOpenChange={setShowImportPreview}
      recipes={parsedRecipes}
      onImport={handleImportRecipes}
      isImporting={isImporting}
    />
    </>
  );
};

export default RecipeManagement;
