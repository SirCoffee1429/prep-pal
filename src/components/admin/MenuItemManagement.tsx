import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, Upload, FileStack } from "lucide-react";
import * as XLSX from "xlsx";
import type { Database } from "@/integrations/supabase/types";
import MenuItemImportPreview, { ParsedMenuItem } from "./MenuItemImportPreview";
import UnifiedImportWizard from "./UnifiedImportWizard";

type KitchenStation = Database["public"]["Enums"]["kitchen_station"];

interface MenuItem {
  id: string;
  name: string;
  station: KitchenStation;
  unit: string;
  is_active: boolean;
  recipe_id: string | null;
}

interface Recipe {
  id: string;
  name: string;
}

const STATIONS: { value: KitchenStation; label: string }[] = [
  { value: "grill", label: "Grill" },
  { value: "saute", label: "Sauté" },
  { value: "fry", label: "Fry" },
  { value: "salad", label: "Salad" },
  { value: "line", label: "Line" },
];

const MenuItemManagement = () => {
  const { toast } = useToast();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedMenuItems, setParsedMenuItems] = useState<ParsedMenuItem[]>([]);
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isUnifiedWizardOpen, setIsUnifiedWizardOpen] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [station, setStation] = useState<KitchenStation>("grill");
  const [unit, setUnit] = useState("portions");
  const [recipeId, setRecipeId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [itemsRes, recipesRes] = await Promise.all([
        supabase
          .from("menu_items")
          .select("*")
          .order("station")
          .order("name"),
        supabase.from("recipes").select("id, name").order("name"),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (recipesRes.error) throw recipesRes.error;

      setMenuItems(itemsRes.data || []);
      setRecipes(recipesRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to load menu items",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setStation("grill");
    setUnit("portions");
    setRecipeId(null);
    setEditingItem(null);
  };

  const openDialog = (item?: MenuItem) => {
    if (item) {
      setEditingItem(item);
      setName(item.name);
      setStation(item.station);
      setUnit(item.unit);
      setRecipeId(item.recipe_id);
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      if (editingItem) {
        const { error } = await supabase
          .from("menu_items")
          .update({ name, station, unit, recipe_id: recipeId })
          .eq("id", editingItem.id);

        if (error) throw error;
        toast({ title: "Success", description: "Menu item updated" });
      } else {
        const { error } = await supabase
          .from("menu_items")
          .insert({ name, station, unit, recipe_id: recipeId });

        if (error) throw error;
        toast({ title: "Success", description: "Menu item created" });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error("Error saving:", error);
      toast({
        title: "Error",
        description: "Failed to save menu item",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;

    try {
      const { error } = await supabase.from("menu_items").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Success", description: "Menu item deleted" });
      fetchData();
    } catch (error) {
      console.error("Error deleting:", error);
      toast({
        title: "Error",
        description: "Failed to delete menu item",
        variant: "destructive",
      });
    }
  };

  // === Import Functions ===
  const extractTextFromWorkbook = (workbook: XLSX.WorkBook): string => {
    const allSheetText: string[] = [];
    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(worksheet, { blankrows: false });
      allSheetText.push(`=== Sheet: ${sheetName} ===\n${csv}`);
    });
    return allSheetText.join("\n\n");
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsParsing(true);
    const allParsedItems: ParsedMenuItem[] = [];

    try {
      for (const file of Array.from(files)) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const fileContent = extractTextFromWorkbook(workbook);

        const response = await supabase.functions.invoke("analyze-document", {
          body: { fileContent, fileName: file.name, mimeType: "text/csv" },
        });

        if (response.error) {
          console.error("Parse error:", response.error);
          toast({
            title: "Parse Error",
            description: `Failed to parse ${file.name}: ${response.error.message}`,
            variant: "destructive",
          });
          continue;
        }

        const responseData = response.data;
        if (responseData?.error) {
          toast({
            title: "Parse Error",
            description: responseData.error,
            variant: "destructive",
          });
          continue;
        }

        // Handle unified response structure
        if (responseData?.type === "menu_item" && responseData?.data?.menu_items && Array.isArray(responseData.data.menu_items)) {
          allParsedItems.push(...responseData.data.menu_items);
        }
      }

      if (allParsedItems.length > 0) {
        setParsedMenuItems(allParsedItems);
        setIsImportPreviewOpen(true);
      } else {
        toast({
          title: "No Items Found",
          description: "No menu items could be extracted from the uploaded files.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error processing files:", error);
      toast({
        title: "Error",
        description: "Failed to process the uploaded files",
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleImport = async (
    items: Array<ParsedMenuItem & { station: KitchenStation }>
  ) => {
    setIsImporting(true);

    try {
      let successCount = 0;
      let skippedCount = 0;

      for (const item of items) {
        // Check if menu item already exists
        const existingMenuItem = menuItems.find(
          (m) => m.name.toLowerCase().trim() === item.name.toLowerCase().trim()
        );

        if (existingMenuItem) {
          skippedCount++;
          continue;
        }

        // Check if recipe exists, or create new one
        let recipeIdToLink: string | null = null;
        const existingRecipe = recipes.find(
          (r) => r.name.toLowerCase().trim() === item.name.toLowerCase().trim()
        );

        if (existingRecipe) {
          recipeIdToLink = existingRecipe.id;
        } else {
          // Create new recipe
          const recipePayload = {
            name: item.name,
            ingredients: item.ingredients as unknown as Database["public"]["Tables"]["recipes"]["Insert"]["ingredients"],
            method: item.method,
            recipe_cost: item.recipe_cost,
            portion_cost: item.portion_cost,
            menu_price: item.menu_price,
            food_cost_percent: item.food_cost_percent,
          };
          const { data: newRecipe, error: recipeError } = await supabase
            .from("recipes")
            .insert(recipePayload)
            .select("id")
            .single();

          if (recipeError) {
            console.error("Error creating recipe:", recipeError);
            toast({
              title: "Error",
              description: `Failed to create recipe for ${item.name}`,
              variant: "destructive",
            });
            continue;
          }
          recipeIdToLink = newRecipe.id;
        }

        // Create menu item
        const { error: menuItemError } = await supabase.from("menu_items").insert({
          name: item.name,
          station: item.station,
          unit: "portions",
          recipe_id: recipeIdToLink,
        });

        if (menuItemError) {
          console.error("Error creating menu item:", menuItemError);
          toast({
            title: "Error",
            description: `Failed to create menu item ${item.name}`,
            variant: "destructive",
          });
          continue;
        }

        successCount++;
      }

      toast({
        title: "Import Complete",
        description: `Imported ${successCount} item${successCount !== 1 ? "s" : ""}${
          skippedCount > 0 ? `, skipped ${skippedCount} existing` : ""
        }`,
      });

      setIsImportPreviewOpen(false);
      setParsedMenuItems([]);
      fetchData();
    } catch (error) {
      console.error("Error importing:", error);
      toast({
        title: "Error",
        description: "Failed to import menu items",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
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
          <CardTitle>Menu Items</CardTitle>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => setIsUnifiedWizardOpen(true)}
            >
              <FileStack className="mr-2 h-4 w-4" />
              Unified Import
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing}
            >
              {isParsing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Import from Excel
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => openDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingItem ? "Edit Menu Item" : "Add Menu Item"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Ribeye Steak"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="station">Station</Label>
                    <Select value={station} onValueChange={(v) => setStation(v as KitchenStation)}>
                      <SelectTrigger>
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
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unit</Label>
                    <Input
                      id="unit"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="e.g., portions, lbs, quarts"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recipe">Recipe (Optional)</Label>
                    <Select 
                      value={recipeId || "none"} 
                      onValueChange={(v) => setRecipeId(v === "none" ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a recipe" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No recipe</SelectItem>
                        {recipes.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleSave}
                    className="w-full"
                    disabled={isSaving}
                  >
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingItem ? "Update" : "Create"}
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
                <TableHead>Station</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Recipe</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {menuItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No menu items yet. Add your first item above.
                  </TableCell>
                </TableRow>
              ) : (
                menuItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="capitalize">{item.station}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>
                      {recipes.find((r) => r.id === item.recipe_id)?.name || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDialog(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(item.id)}
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

      <MenuItemImportPreview
        open={isImportPreviewOpen}
        onOpenChange={setIsImportPreviewOpen}
        menuItems={parsedMenuItems}
        existingRecipes={recipes}
        onImport={handleImport}
        isImporting={isImporting}
      />

      <UnifiedImportWizard
        open={isUnifiedWizardOpen}
        onOpenChange={setIsUnifiedWizardOpen}
        onComplete={fetchData}
      />
    </>
  );
};

export default MenuItemManagement;
