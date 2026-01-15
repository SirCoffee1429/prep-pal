import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Upload,
  FileSpreadsheet,
  ChefHat,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import * as XLSX from "xlsx";
import type { Database } from "@/integrations/supabase/types";

type KitchenStation = Database["public"]["Enums"]["kitchen_station"];

// Master menu item from financial workbook
interface MasterMenuItem {
  category: string;
  name: string;
  menu_price: number;
  food_cost: number;
  cost_percent: number;
  gross_margin?: number;
  gross_margin_percent?: number;
  inferred_station: string;
}

// Recipe data from recipe cards
interface ParsedRecipe {
  name: string;
  ingredients: Array<{
    item: string;
    quantity: string;
    measure?: string;
    unit_cost?: number;
    total_cost?: number;
  }>;
  method?: string;
  recipe_cost?: number;
  portion_cost?: number;
  menu_price?: number;
  food_cost_percent?: number;
  inferred_station: string;
  fileName: string;
}

// Combined item for review
interface CombinedItem {
  masterItem: MasterMenuItem;
  matchedRecipe: ParsedRecipe | null;
  stationOverride?: KitchenStation;
  selected: boolean;
}

interface UnifiedImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

const STATIONS: { value: KitchenStation; label: string }[] = [
  { value: "grill", label: "Grill" },
  { value: "saute", label: "Sauté" },
  { value: "fry", label: "Fry" },
  { value: "salad", label: "Salad" },
  { value: "line", label: "Line" },
];

const UnifiedImportWizard = ({
  open,
  onOpenChange,
  onComplete,
}: UnifiedImportWizardProps) => {
  const { toast } = useToast();
  const masterFileRef = useRef<HTMLInputElement>(null);
  const recipeFilesRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Master workbook
  const [masterItems, setMasterItems] = useState<MasterMenuItem[]>([]);
  const [isParseMasterLoading, setIsParseMasterLoading] = useState(false);
  const [masterFileName, setMasterFileName] = useState("");

  // Step 2: Recipe cards
  const [recipes, setRecipes] = useState<ParsedRecipe[]>([]);
  const [isParseRecipesLoading, setIsParseRecipesLoading] = useState(false);
  const [recipeFileNames, setRecipeFileNames] = useState<string[]>([]);

  // Step 3: Combined items for review
  const [combinedItems, setCombinedItems] = useState<CombinedItem[]>([]);

  // Step 4: Import
  const [isImporting, setIsImporting] = useState(false);

  // Extract text from Excel workbook
  const extractTextFromWorkbook = (workbook: XLSX.WorkBook): string => {
    const allSheetText: string[] = [];
    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(worksheet, { blankrows: false });
      allSheetText.push(`=== Sheet: ${sheetName} ===\n${csv}`);
    });
    return allSheetText.join("\n\n");
  };

  // Fuzzy name matching
  const fuzzyMatch = (name1: string, name2: string): boolean => {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[0-9]+\s*(oz|lb|g|kg)\.?\s*/gi, "")
        .replace(/half|full/gi, "")
        .replace(/[^a-z\s]/g, "")
        .trim();

    const n1 = normalize(name1);
    const n2 = normalize(name2);

    // Exact match after normalization
    if (n1 === n2) return true;

    // One contains the other
    if (n1.includes(n2) || n2.includes(n1)) return true;

    // Check word overlap
    const words1 = n1.split(/\s+/).filter((w) => w.length > 2);
    const words2 = n2.split(/\s+/).filter((w) => w.length > 2);
    const overlap = words1.filter((w) => words2.some((w2) => w2.includes(w) || w.includes(w2)));
    return overlap.length >= 1 && overlap.length >= Math.min(words1.length, words2.length) * 0.5;
  };

  // Step 1: Parse master workbook
  const handleMasterFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParseMasterLoading(true);
    setMasterFileName(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const fileContent = extractTextFromWorkbook(workbook);

      const response = await supabase.functions.invoke("parse-master-menu", {
        body: { fileContent, fileName: file.name },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;
      if (data.error) {
        throw new Error(data.error);
      }

      if (data.menu_items && Array.isArray(data.menu_items)) {
        setMasterItems(data.menu_items);
        toast({
          title: "Master File Parsed",
          description: `Found ${data.menu_items.length} menu items`,
        });
      }
    } catch (error) {
      console.error("Error parsing master file:", error);
      toast({
        title: "Parse Error",
        description: error instanceof Error ? error.message : "Failed to parse master file",
        variant: "destructive",
      });
    } finally {
      setIsParseMasterLoading(false);
      if (masterFileRef.current) masterFileRef.current.value = "";
    }
  };

  // Step 2: Parse recipe files
  const handleRecipeFilesSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsParseRecipesLoading(true);
    const fileNames = Array.from(files).map((f) => f.name);
    setRecipeFileNames(fileNames);

    try {
      const parsedRecipes: ParsedRecipe[] = [];

      for (const file of Array.from(files)) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const fileContent = extractTextFromWorkbook(workbook);

        const response = await supabase.functions.invoke("parse-menu-items", {
          body: { fileContent, fileName: file.name },
        });

        if (response.error) {
          console.error(`Error parsing ${file.name}:`, response.error);
          continue;
        }

        const data = response.data;
        if (data.menu_items && Array.isArray(data.menu_items)) {
          parsedRecipes.push(
            ...data.menu_items.map((item: any) => ({
              ...item,
              fileName: file.name,
            }))
          );
        }
      }

      setRecipes(parsedRecipes);
      toast({
        title: "Recipe Cards Parsed",
        description: `Parsed ${parsedRecipes.length} recipes from ${fileNames.length} files`,
      });
    } catch (error) {
      console.error("Error parsing recipe files:", error);
      toast({
        title: "Parse Error",
        description: "Failed to parse some recipe files",
        variant: "destructive",
      });
    } finally {
      setIsParseRecipesLoading(false);
      if (recipeFilesRef.current) recipeFilesRef.current.value = "";
    }
  };

  // Proceed to step 3: match items
  const proceedToReview = () => {
    const combined: CombinedItem[] = masterItems.map((master) => {
      const match = recipes.find((r) => fuzzyMatch(master.name, r.name));
      return {
        masterItem: master,
        matchedRecipe: match || null,
        selected: true,
      };
    });
    setCombinedItems(combined);
    setStep(3);
  };

  // Step 3: Update selection and station
  const toggleSelection = (index: number) => {
    setCombinedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
    );
  };

  const toggleAll = () => {
    const allSelected = combinedItems.every((item) => item.selected);
    setCombinedItems((prev) => prev.map((item) => ({ ...item, selected: !allSelected })));
  };

  const setStation = (index: number, station: KitchenStation) => {
    setCombinedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, stationOverride: station } : item))
    );
  };

  const getStation = (item: CombinedItem): KitchenStation => {
    return item.stationOverride || (item.masterItem.inferred_station as KitchenStation) || "line";
  };

  // Step 4: Import
  const handleImport = async () => {
    setIsImporting(true);
    const selectedItems = combinedItems.filter((item) => item.selected);

    try {
      let successCount = 0;
      let recipeCount = 0;

      for (const item of selectedItems) {
        let recipeId: string | null = null;

        // Create recipe if we have recipe data
        if (item.matchedRecipe) {
          const recipePayload = {
            name: item.matchedRecipe.name,
            ingredients: item.matchedRecipe.ingredients as unknown as Database["public"]["Tables"]["recipes"]["Insert"]["ingredients"],
            method: item.matchedRecipe.method,
            recipe_cost: item.matchedRecipe.recipe_cost,
            portion_cost: item.matchedRecipe.portion_cost,
            menu_price: item.masterItem.menu_price, // Use master price
            food_cost_percent: item.masterItem.cost_percent, // Use master cost %
          };

          const { data: newRecipe, error: recipeError } = await supabase
            .from("recipes")
            .insert(recipePayload)
            .select("id")
            .single();

          if (recipeError) {
            console.error("Error creating recipe:", recipeError);
          } else {
            recipeId = newRecipe.id;
            recipeCount++;
          }
        }

        // Create menu item
        const { error: menuError } = await supabase.from("menu_items").insert({
          name: item.masterItem.name,
          station: getStation(item),
          unit: "portions",
          recipe_id: recipeId,
        });

        if (menuError) {
          console.error("Error creating menu item:", menuError);
        } else {
          successCount++;
        }
      }

      toast({
        title: "Import Complete",
        description: `Created ${successCount} menu items and ${recipeCount} recipes`,
      });

      setStep(4);
      setTimeout(() => {
        onComplete();
        onOpenChange(false);
        // Reset state
        setStep(1);
        setMasterItems([]);
        setRecipes([]);
        setCombinedItems([]);
        setMasterFileName("");
        setRecipeFileNames([]);
      }, 1500);
    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: "Import Error",
        description: "Failed to import some items",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const formatCurrency = (value?: number) => {
    if (value === undefined || value === null) return "-";
    return `$${value.toFixed(2)}`;
  };

  const selectedCount = combinedItems.filter((item) => item.selected).length;
  const matchedCount = combinedItems.filter((item) => item.matchedRecipe).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChefHat className="h-5 w-5" />
            Unified Menu & Recipe Import
            <Badge variant="outline" className="ml-2">
              Step {step} of 4
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Master Workbook */}
        {step === 1 && (
          <div className="space-y-6 py-4">
            <div className="text-center space-y-2">
              <FileSpreadsheet className="h-16 w-16 mx-auto text-muted-foreground" />
              <h3 className="text-lg font-semibold">Upload Master Food Cost Workbook</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Upload your master spreadsheet containing menu items, prices, and food cost data.
                This will be the source of truth for financial data.
              </p>
            </div>

            <input
              ref={masterFileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleMasterFileSelect}
              className="hidden"
            />

            <div className="flex flex-col items-center gap-4">
              <Button
                size="lg"
                onClick={() => masterFileRef.current?.click()}
                disabled={isParseMasterLoading}
              >
                {isParseMasterLoading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-5 w-5" />
                )}
                Select Master Workbook
              </Button>

              {masterItems.length > 0 && (
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">
                    {masterFileName}: {masterItems.length} items found
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Recipe Cards */}
        {step === 2 && (
          <div className="space-y-6 py-4">
            <div className="text-center space-y-2">
              <ChefHat className="h-16 w-16 mx-auto text-muted-foreground" />
              <h3 className="text-lg font-semibold">Upload Recipe Cards (Optional)</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Upload your individual recipe card Excel files. These will be matched to menu items
                to add ingredients and preparation methods.
              </p>
            </div>

            <input
              ref={recipeFilesRef}
              type="file"
              accept=".xlsx,.xls"
              multiple
              onChange={handleRecipeFilesSelect}
              className="hidden"
            />

            <div className="flex flex-col items-center gap-4">
              <Button
                size="lg"
                variant="outline"
                onClick={() => recipeFilesRef.current?.click()}
                disabled={isParseRecipesLoading}
              >
                {isParseRecipesLoading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-5 w-5" />
                )}
                Select Recipe Files
              </Button>

              {recipes.length > 0 && (
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">
                    {recipes.length} recipes parsed from {recipeFileNames.length} files
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Review & Match */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">
                  {masterItems.length} menu items • {matchedCount} with recipes
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={toggleAll}>
                {combinedItems.every((i) => i.selected) ? "Deselect All" : "Select All"}
              </Button>
            </div>

            <ScrollArea className="max-h-[45vh] pr-4">
              <Accordion type="multiple" className="space-y-2">
                {combinedItems.map((item, index) => (
                  <AccordionItem
                    key={index}
                    value={`item-${index}`}
                    className="border rounded-lg px-4"
                  >
                    <div className="flex items-center gap-3 py-2">
                      <Checkbox
                        checked={item.selected}
                        onCheckedChange={() => toggleSelection(index)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <AccordionTrigger className="flex-1 hover:no-underline">
                        <div className="flex items-center gap-2 text-left flex-1">
                          <span className="font-medium">{item.masterItem.name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {item.masterItem.category}
                          </Badge>
                          {item.matchedRecipe ? (
                            <Badge variant="default" className="text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Recipe
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              No Recipe
                            </Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <div onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={getStation(item)}
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
                        {/* Financial Data */}
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Price: {formatCurrency(item.masterItem.menu_price)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">Cost:</span>
                            <span>{formatCurrency(item.masterItem.food_cost)}</span>
                          </div>
                          <Badge
                            variant={item.masterItem.cost_percent <= 35 ? "default" : "secondary"}
                          >
                            {item.masterItem.cost_percent.toFixed(1)}% food cost
                          </Badge>
                        </div>

                        {/* Matched Recipe Info */}
                        {item.matchedRecipe && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm text-primary">
                              <ChefHat className="h-4 w-4" />
                              <span>
                                Matched: <strong>{item.matchedRecipe.name}</strong>
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {item.matchedRecipe.ingredients.length} ingredients
                              </Badge>
                            </div>

                            {/* Ingredients Preview */}
                            <div className="grid gap-1 text-sm">
                              {item.matchedRecipe.ingredients.slice(0, 4).map((ing, i) => (
                                <div key={i} className="flex justify-between text-muted-foreground">
                                  <span>{ing.item}</span>
                                  <span>
                                    {ing.quantity} {ing.measure}
                                  </span>
                                </div>
                              ))}
                              {item.matchedRecipe.ingredients.length > 4 && (
                                <span className="text-muted-foreground text-xs">
                                  +{item.matchedRecipe.ingredients.length - 4} more...
                                </span>
                              )}
                            </div>

                            {/* Method Preview */}
                            {item.matchedRecipe.method && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {item.matchedRecipe.method}
                              </p>
                            )}
                          </div>
                        )}

                        {!item.matchedRecipe && (
                          <p className="text-sm text-muted-foreground italic">
                            No recipe card matched. Menu item will be created without recipe data.
                          </p>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </ScrollArea>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 4 && (
          <div className="py-12 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 mx-auto text-primary" />
            <h3 className="text-xl font-semibold">Import Complete!</h3>
            <p className="text-muted-foreground">
              Your menu items and recipes have been imported successfully.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 1 && (
            <Button onClick={() => setStep(2)} disabled={masterItems.length === 0}>
              Next: Recipe Cards
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}

          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={proceedToReview}>
                Review & Match
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}

          {step === 3 && (
            <>
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleImport} disabled={selectedCount === 0 || isImporting}>
                {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import {selectedCount} Items
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UnifiedImportWizard;
