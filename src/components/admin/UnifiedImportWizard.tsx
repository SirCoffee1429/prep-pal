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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
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
  RefreshCw,
  SkipForward,
  Settings2,
} from "lucide-react";
import * as XLSX from "xlsx";
import type { Database } from "@/integrations/supabase/types";

type KitchenStation = Database["public"]["Enums"]["kitchen_station"];
type ImportType = "menu_items" | "recipes" | "both";

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

// Existing database records
interface ExistingMenuItem {
  id: string;
  name: string;
  station: KitchenStation;
  recipe_id: string | null;
}

interface ExistingRecipe {
  id: string;
  name: string;
}

// Duplicate status for an item
type DuplicateStatus = "new" | "menu_exists" | "recipe_exists" | "both_exist";

// Per-item import type
type ItemImportType = "menu_item" | "recipe" | "both";

// Combined item for review
interface CombinedItem {
  masterItem: MasterMenuItem;
  matchedRecipe: ParsedRecipe | null;
  selected: boolean;
  duplicateStatus: DuplicateStatus;
  existingMenuItemId?: string;
  existingRecipeId?: string;
  // Per-item overrides
  itemImportType: ItemImportType;
  itemStation: KitchenStation;
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

  // Wizard state - now 4 steps with config first
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Configuration (NEW)
  const [importType, setImportType] = useState<ImportType>("both");
  const [selectedStation, setSelectedStation] = useState<KitchenStation | "infer">("infer");

  // Step 2: File uploads
  const [masterItems, setMasterItems] = useState<MasterMenuItem[]>([]);
  const [isParseMasterLoading, setIsParseMasterLoading] = useState(false);
  const [masterFileName, setMasterFileName] = useState("");

  const [recipes, setRecipes] = useState<ParsedRecipe[]>([]);
  const [isParseRecipesLoading, setIsParseRecipesLoading] = useState(false);
  const [recipeFileNames, setRecipeFileNames] = useState<string[]>([]);

  // Step 3: Combined items for review
  const [combinedItems, setCombinedItems] = useState<CombinedItem[]>([]);
  const [existingMenuItems, setExistingMenuItems] = useState<ExistingMenuItem[]>([]);
  const [existingRecipes, setExistingRecipes] = useState<ExistingRecipe[]>([]);
  const [duplicateHandling, setDuplicateHandling] = useState<"skip" | "update">("skip");
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);

  // Step 4: Import
  const [isImporting, setIsImporting] = useState(false);

  // Reset wizard state
  const resetWizard = () => {
    setStep(1);
    setImportType("both");
    setSelectedStation("infer");
    setMasterItems([]);
    setRecipes([]);
    setCombinedItems([]);
    setMasterFileName("");
    setRecipeFileNames([]);
    setExistingMenuItems([]);
    setExistingRecipes([]);
    setDuplicateHandling("skip");
  };

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

    if (n1 === n2) return true;
    if (n1.includes(n2) || n2.includes(n1)) return true;

    const words1 = n1.split(/\s+/).filter((w) => w.length > 2);
    const words2 = n2.split(/\s+/).filter((w) => w.length > 2);
    const overlap = words1.filter((w) => words2.some((w2) => w2.includes(w) || w.includes(w2)));
    return overlap.length >= 1 && overlap.length >= Math.min(words1.length, words2.length) * 0.5;
  };

  // Fetch existing data from database
  const fetchExistingData = async () => {
    setIsLoadingExisting(true);
    try {
      const [menuItemsRes, recipesRes] = await Promise.all([
        supabase.from("menu_items").select("id, name, station, recipe_id"),
        supabase.from("recipes").select("id, name"),
      ]);

      if (menuItemsRes.data) {
        setExistingMenuItems(menuItemsRes.data as ExistingMenuItem[]);
      }
      if (recipesRes.data) {
        setExistingRecipes(recipesRes.data as ExistingRecipe[]);
      }
    } catch (error) {
      console.error("Error fetching existing data:", error);
    } finally {
      setIsLoadingExisting(false);
    }
  };

  // Parse master workbook
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

  // Parse recipe files
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

  // Get the effective station for an item
  const getEffectiveStation = (inferredStation: string): KitchenStation => {
    if (selectedStation !== "infer") {
      return selectedStation;
    }
    return (inferredStation as KitchenStation) || "line";
  };

  // Map global import type to per-item import type default
  const getDefaultItemImportType = (): ItemImportType => {
    if (importType === "menu_items") return "menu_item";
    if (importType === "recipes") return "recipe";
    return "both";
  };

  // Proceed to step 3: match items and check for duplicates
  const proceedToReview = async () => {
    await fetchExistingData();

    let combined: CombinedItem[] = [];
    const defaultItemType = getDefaultItemImportType();

    if (importType === "recipes") {
      // Only recipes - create combined items from recipes
      combined = recipes.map((recipe) => {
        const existingRecipe = existingRecipes.find((r) => fuzzyMatch(recipe.name, r.name));
        const existingMenuItem = existingMenuItems.find((m) => fuzzyMatch(recipe.name, m.name));

        let duplicateStatus: DuplicateStatus = "new";
        if (existingMenuItem && existingRecipe) {
          duplicateStatus = "both_exist";
        } else if (existingMenuItem) {
          duplicateStatus = "menu_exists";
        } else if (existingRecipe) {
          duplicateStatus = "recipe_exists";
        }

        const effectiveStation = getEffectiveStation(recipe.inferred_station || "line");

        return {
          masterItem: {
            category: "",
            name: recipe.name,
            menu_price: recipe.menu_price || 0,
            food_cost: recipe.portion_cost || 0,
            cost_percent: recipe.food_cost_percent || 0,
            inferred_station: recipe.inferred_station || "line",
          },
          matchedRecipe: recipe,
          selected: true,
          duplicateStatus,
          existingMenuItemId: existingMenuItem?.id,
          existingRecipeId: existingRecipe?.id,
          itemImportType: defaultItemType,
          itemStation: effectiveStation,
        };
      });
    } else {
      // Menu items (or both) - use master items
      combined = masterItems.map((master) => {
        const match = recipes.find((r) => fuzzyMatch(master.name, r.name));
        const existingMenuItem = existingMenuItems.find((m) => fuzzyMatch(master.name, m.name));
        const recipeName = match?.name || master.name;
        const existingRecipe = existingRecipes.find((r) => fuzzyMatch(recipeName, r.name));

        let duplicateStatus: DuplicateStatus = "new";
        if (existingMenuItem && existingRecipe) {
          duplicateStatus = "both_exist";
        } else if (existingMenuItem) {
          duplicateStatus = "menu_exists";
        } else if (existingRecipe) {
          duplicateStatus = "recipe_exists";
        }

        const effectiveStation = getEffectiveStation(master.inferred_station);

        return {
          masterItem: master,
          matchedRecipe: match || null,
          selected: true,
          duplicateStatus,
          existingMenuItemId: existingMenuItem?.id,
          existingRecipeId: existingRecipe?.id,
          itemImportType: defaultItemType,
          itemStation: effectiveStation,
        };
      });
    }

    setCombinedItems(combined);
    setStep(3);
  };

  // Step 3: Update selection
  const toggleSelection = (index: number) => {
    setCombinedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
    );
  };

  const toggleAll = () => {
    const allSelected = combinedItems.every((item) => item.selected);
    setCombinedItems((prev) => prev.map((item) => ({ ...item, selected: !allSelected })));
  };

  // Update per-item import type
  const updateItemImportType = (index: number, value: ItemImportType) => {
    setCombinedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, itemImportType: value } : item))
    );
  };

  // Update per-item station
  const updateItemStation = (index: number, value: KitchenStation) => {
    setCombinedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, itemStation: value } : item))
    );
  };

  // Step 4: Import with duplicate handling
  const handleImport = async () => {
    setIsImporting(true);
    const selectedItems = combinedItems.filter((item) => item.selected);

    let createdMenuItems = 0;
    let createdRecipes = 0;
    let skippedItems = 0;
    let updatedMenuItems = 0;
    let updatedRecipes = 0;

    try {
      for (const item of selectedItems) {
        const isDuplicateMenuItem = item.duplicateStatus === "menu_exists" || item.duplicateStatus === "both_exist";
        const isDuplicateRecipe = item.duplicateStatus === "recipe_exists" || item.duplicateStatus === "both_exist";
        
        // Check per-item import type settings
        const shouldImportRecipe = item.itemImportType === "recipe" || item.itemImportType === "both";
        const shouldImportMenuItem = item.itemImportType === "menu_item" || item.itemImportType === "both";

        // Handle menu item duplicates - only skip if importing menu items and duplicate exists
        if (shouldImportMenuItem && isDuplicateMenuItem && duplicateHandling === "skip") {
          skippedItems++;
          continue;
        }

        let recipeId: string | null = null;

        // Handle recipe (only if per-item setting includes recipes)
        if (shouldImportRecipe && item.matchedRecipe) {
          if (isDuplicateRecipe && item.existingRecipeId) {
            if (duplicateHandling === "update") {
              const { error: recipeError } = await supabase
                .from("recipes")
                .update({
                  ingredients: item.matchedRecipe.ingredients as unknown as Database["public"]["Tables"]["recipes"]["Update"]["ingredients"],
                  method: item.matchedRecipe.method,
                  recipe_cost: item.matchedRecipe.recipe_cost,
                  portion_cost: item.matchedRecipe.portion_cost,
                  menu_price: item.masterItem.menu_price,
                  food_cost_percent: item.masterItem.cost_percent,
                })
                .eq("id", item.existingRecipeId);

              if (recipeError) {
                console.error("Error updating recipe:", recipeError);
              } else {
                updatedRecipes++;
                recipeId = item.existingRecipeId;
              }
            } else {
              recipeId = item.existingRecipeId;
            }
          } else if (!isDuplicateRecipe) {
            const recipePayload = {
              name: item.matchedRecipe.name,
              ingredients: item.matchedRecipe.ingredients as unknown as Database["public"]["Tables"]["recipes"]["Insert"]["ingredients"],
              method: item.matchedRecipe.method,
              recipe_cost: item.matchedRecipe.recipe_cost,
              portion_cost: item.matchedRecipe.portion_cost,
              menu_price: item.masterItem.menu_price,
              food_cost_percent: item.masterItem.cost_percent,
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
              createdRecipes++;
            }
          }
        } else if (item.existingRecipeId) {
          recipeId = item.existingRecipeId;
        }

        // Handle menu item (only if per-item setting includes menu items)
        if (shouldImportMenuItem) {
          if (isDuplicateMenuItem && item.existingMenuItemId && duplicateHandling === "update") {
            const { error: menuError } = await supabase
              .from("menu_items")
              .update({
                station: item.itemStation,
                recipe_id: recipeId,
              })
              .eq("id", item.existingMenuItemId);

            if (menuError) {
              console.error("Error updating menu item:", menuError);
            } else {
              updatedMenuItems++;
            }
          } else if (!isDuplicateMenuItem) {
            const { error: menuError } = await supabase.from("menu_items").insert({
              name: item.masterItem.name,
              station: item.itemStation,
              unit: "portions",
              recipe_id: recipeId,
            });

            if (menuError) {
              console.error("Error creating menu item:", menuError);
            } else {
              createdMenuItems++;
            }
          }
        }
      }

      const summaryParts: string[] = [];
      if (createdMenuItems > 0) summaryParts.push(`Created ${createdMenuItems} menu items`);
      if (createdRecipes > 0) summaryParts.push(`${createdRecipes} recipes`);
      if (updatedMenuItems > 0) summaryParts.push(`Updated ${updatedMenuItems} items`);
      if (updatedRecipes > 0) summaryParts.push(`${updatedRecipes} recipes`);
      if (skippedItems > 0) summaryParts.push(`Skipped ${skippedItems} duplicates`);

      toast({
        title: "Import Complete",
        description: summaryParts.join(" • ") || "No changes made",
      });

      setStep(4);
      setTimeout(() => {
        onComplete();
        onOpenChange(false);
        resetWizard();
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
  const duplicateCount = combinedItems.filter((item) => item.duplicateStatus !== "new").length;
  const newItemsCount = combinedItems.filter((item) => item.selected && item.duplicateStatus === "new").length;

  const getDuplicateStatusBadge = (status: DuplicateStatus) => {
    switch (status) {
      case "new":
        return (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-xs">
            New
          </Badge>
        );
      case "menu_exists":
        return (
          <Badge variant="secondary" className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs">
            Exists
          </Badge>
        );
      case "recipe_exists":
        return (
          <Badge variant="secondary" className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
            Recipe Exists
          </Badge>
        );
      case "both_exist":
        return (
          <Badge variant="secondary" className="bg-orange-600 hover:bg-orange-700 text-white text-xs">
            Both Exist
          </Badge>
        );
    }
  };

  // Check if we can proceed from step 2
  const canProceedFromStep2 = () => {
    if (importType === "menu_items") return masterItems.length > 0;
    if (importType === "recipes") return recipes.length > 0;
    return masterItems.length > 0; // "both" requires master items, recipes are optional
  };

  // Get import type label
  const getImportTypeLabel = () => {
    switch (importType) {
      case "menu_items":
        return "Menu Items Only";
      case "recipes":
        return "Recipes Only";
      case "both":
        return "Menu Items + Recipes";
    }
  };

  // Get station label
  const getStationLabel = () => {
    if (selectedStation === "infer") return "AI Infer";
    return STATIONS.find((s) => s.value === selectedStation)?.label || selectedStation;
  };

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

        {/* Step 1: Configure Import (NEW) */}
        {step === 1 && (
          <div className="space-y-6 py-4">
            <div className="text-center space-y-2">
              <Settings2 className="h-16 w-16 mx-auto text-muted-foreground" />
              <h3 className="text-lg font-semibold">Configure Import</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Select what you're importing and which station these items belong to.
              </p>
            </div>

            <div className="space-y-6 max-w-md mx-auto">
              {/* Import Type Selection */}
              <div className="space-y-3">
                <Label className="text-base font-medium">What are you importing?</Label>
                <RadioGroup
                  value={importType}
                  onValueChange={(v) => setImportType(v as ImportType)}
                  className="space-y-3"
                >
                  <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value="menu_items" id="menu_items" className="mt-1" />
                    <Label htmlFor="menu_items" className="flex-1 cursor-pointer">
                      <div className="font-medium">Menu Items Only</div>
                      <div className="text-sm text-muted-foreground">
                        Financial data, prices, food costs from master workbook
                      </div>
                    </Label>
                  </div>
                  <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value="recipes" id="recipes" className="mt-1" />
                    <Label htmlFor="recipes" className="flex-1 cursor-pointer">
                      <div className="font-medium">Recipes Only</div>
                      <div className="text-sm text-muted-foreground">
                        Ingredients, methods, prep instructions from recipe cards
                      </div>
                    </Label>
                  </div>
                  <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value="both" id="both" className="mt-1" />
                    <Label htmlFor="both" className="flex-1 cursor-pointer">
                      <div className="font-medium">Menu Items + Recipes</div>
                      <div className="text-sm text-muted-foreground">
                        Full import with linked recipes and financial data
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Station Selection */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Which station do these items belong to?</Label>
                <Select
                  value={selectedStation}
                  onValueChange={(v) => setSelectedStation(v as KitchenStation | "infer")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select station" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="infer">
                      <div className="flex items-center gap-2">
                        <span>🤖</span>
                        <span>All Stations (AI Infer)</span>
                      </div>
                    </SelectItem>
                    {STATIONS.map((station) => (
                      <SelectItem key={station.value} value={station.value}>
                        {station.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {selectedStation === "infer"
                    ? "AI will automatically assign stations based on item categories"
                    : `All imported items will be assigned to ${getStationLabel()}`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Upload Files */}
        {step === 2 && (
          <div className="space-y-6 py-4">
            {/* Config Summary */}
            <div className="flex items-center justify-center gap-4 text-sm bg-muted/50 rounded-lg p-3">
              <Badge variant="secondary">{getImportTypeLabel()}</Badge>
              <Badge variant="outline">Station: {getStationLabel()}</Badge>
            </div>

            {/* Master Workbook Upload (for menu_items or both) */}
            {(importType === "menu_items" || importType === "both") && (
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground" />
                  <h3 className="text-lg font-semibold">Upload Master Food Cost Workbook</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Upload your master spreadsheet containing menu items, prices, and food cost data.
                  </p>
                </div>

                <input
                  ref={masterFileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleMasterFileSelect}
                  className="hidden"
                />

                <div className="flex flex-col items-center gap-3">
                  <Button
                    size="lg"
                    variant={masterItems.length > 0 ? "outline" : "default"}
                    onClick={() => masterFileRef.current?.click()}
                    disabled={isParseMasterLoading}
                  >
                    {isParseMasterLoading ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-5 w-5" />
                    )}
                    {masterItems.length > 0 ? "Replace Master Workbook" : "Select Master Workbook"}
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

            {/* Separator */}
            {importType === "both" && masterItems.length > 0 && (
              <div className="border-t my-6" />
            )}

            {/* Recipe Cards Upload (for recipes or both) */}
            {(importType === "recipes" || (importType === "both" && masterItems.length > 0)) && (
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <ChefHat className="h-12 w-12 mx-auto text-muted-foreground" />
                  <h3 className="text-lg font-semibold">
                    Upload Recipe Cards {importType === "both" && "(Optional)"}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Upload your individual recipe card Excel files.
                    {importType === "both" && " These will be matched to menu items automatically."}
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

                <div className="flex flex-col items-center gap-3">
                  <Button
                    size="lg"
                    variant={recipes.length > 0 ? "outline" : importType === "recipes" ? "default" : "outline"}
                    onClick={() => recipeFilesRef.current?.click()}
                    disabled={isParseRecipesLoading}
                  >
                    {isParseRecipesLoading ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-5 w-5" />
                    )}
                    {recipes.length > 0 ? "Add More Recipe Files" : "Select Recipe Files"}
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
          </div>
        )}

        {/* Step 3: Review & Match */}
        {step === 3 && (
          <div className="space-y-4">
            {isLoadingExisting ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Checking for duplicates...</span>
              </div>
            ) : (
              <>
                {/* Config Summary */}
                <div className="flex items-center gap-4 text-sm bg-muted/50 rounded-lg p-3">
                  <Badge variant="secondary">{getImportTypeLabel()}</Badge>
                  <Badge variant="outline">Station: {getStationLabel()}</Badge>
                </div>

                {/* Duplicate handling controls */}
                {duplicateCount > 0 && (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                      <AlertCircle className="h-5 w-5" />
                      <span className="font-medium">
                        {duplicateCount} duplicate{duplicateCount > 1 ? "s" : ""} found
                      </span>
                    </div>
                    <RadioGroup
                      value={duplicateHandling}
                      onValueChange={(v) => setDuplicateHandling(v as "skip" | "update")}
                      className="flex gap-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="skip" id="skip" />
                        <Label htmlFor="skip" className="flex items-center gap-1 cursor-pointer">
                          <SkipForward className="h-4 w-4" />
                          Skip existing items
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="update" id="update" />
                        <Label htmlFor="update" className="flex items-center gap-1 cursor-pointer">
                          <RefreshCw className="h-4 w-4" />
                          Update existing items
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}

                <div className="flex items-center justify-between border-b pb-2">
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">
                      {combinedItems.length} items • {matchedCount} with recipes • {newItemsCount} new
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={toggleAll}>
                    {combinedItems.every((i) => i.selected) ? "Deselect All" : "Select All"}
                  </Button>
                </div>

                <ScrollArea className="h-[50vh] pr-4">
                  <Accordion type="multiple" className="space-y-2 pb-4">
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
                            <div className="flex items-center gap-2 text-left flex-1 flex-wrap">
                              <span className="font-medium">{item.masterItem.name}</span>
                              {item.masterItem.category && (
                                <Badge variant="secondary" className="text-xs">
                                  {item.masterItem.category}
                                </Badge>
                              )}
                              {getDuplicateStatusBadge(item.duplicateStatus)}
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
                          
                          {/* Per-item Import Type Dropdown */}
                          <Select
                            value={item.itemImportType}
                            onValueChange={(value: ItemImportType) => updateItemImportType(index, value)}
                          >
                            <SelectTrigger 
                              className="w-[130px] h-8 text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="menu_item">Menu Item</SelectItem>
                              <SelectItem value="recipe">Recipe</SelectItem>
                              <SelectItem value="both">Both</SelectItem>
                            </SelectContent>
                          </Select>

                          {/* Per-item Station Dropdown */}
                          <Select
                            value={item.itemStation}
                            onValueChange={(value: KitchenStation) => updateItemStation(index, value)}
                          >
                            <SelectTrigger 
                              className="w-[100px] h-8 text-xs capitalize"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATIONS.map((station) => (
                                <SelectItem key={station.value} value={station.value}>
                                  {station.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <AccordionContent className="pb-4">
                          <div className="space-y-4 pl-7">
                            {/* Duplicate info */}
                            {item.duplicateStatus !== "new" && (
                              <div className="text-sm text-muted-foreground italic bg-muted/50 rounded p-2">
                                {item.duplicateStatus === "menu_exists" &&
                                  `Menu item already exists in database. Will ${duplicateHandling === "skip" ? "skip" : "update"}.`}
                                {item.duplicateStatus === "recipe_exists" &&
                                  `Recipe already exists. Will ${duplicateHandling === "skip" ? "link to existing" : "update existing"}.`}
                                {item.duplicateStatus === "both_exist" &&
                                  `Both menu item and recipe exist. Will ${duplicateHandling === "skip" ? "skip entirely" : "update both"}.`}
                              </div>
                            )}

                            {/* Financial Data */}
                            {(item.masterItem.menu_price > 0 || item.masterItem.food_cost > 0) && (
                              <div className="flex flex-wrap gap-4 text-sm">
                                <div className="flex items-center gap-1">
                                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span>Price: {formatCurrency(item.masterItem.menu_price)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Cost:</span>
                                  <span>{formatCurrency(item.masterItem.food_cost)}</span>
                                </div>
                                {item.masterItem.cost_percent > 0 && (
                                  <Badge
                                    variant={item.masterItem.cost_percent <= 35 ? "default" : "secondary"}
                                  >
                                    {item.masterItem.cost_percent.toFixed(1)}% food cost
                                  </Badge>
                                )}
                              </div>
                            )}

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
                                {importType === "recipes"
                                  ? "Recipe data will be imported."
                                  : "No recipe card matched. Menu item will be created without recipe data."}
                              </p>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </ScrollArea>
              </>
            )}
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
            <Button onClick={() => setStep(2)}>
              Next: Upload Files
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}

          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={proceedToReview} disabled={!canProceedFromStep2()}>
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
              <Button
                onClick={handleImport}
                disabled={isImporting || selectedCount === 0}
              >
                {isImporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
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
