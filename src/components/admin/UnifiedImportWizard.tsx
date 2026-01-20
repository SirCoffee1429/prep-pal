import { useState, useCallback } from "react";
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
import { Progress } from "@/components/ui/progress";
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
  FileSpreadsheet,
  ChefHat,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  SkipForward,
  FolderUp,
  Sparkles,
} from "lucide-react";
import * as XLSX from "xlsx";
import type { Database } from "@/integrations/supabase/types";
import BatchDropZone from "./BatchDropZone";
import ClassifiedFileList from "./ClassifiedFileList";
import {
  type ClassifiedFile,
  type FileType,
  type BatchUploadState,
  classifyByA1,
  generateContentHash,
  areDuplicates,
  generateFileId,
  createInitialBatchState,
  updateBatchCounts,
} from "@/lib/fileClassification";

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

  // Wizard state - 4 steps
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Station configuration only (import type now auto-detected)
  const [selectedStation, setSelectedStation] = useState<KitchenStation | "infer">("infer");

  // Step 2: Batch upload state
  const [batchState, setBatchState] = useState<BatchUploadState>(createInitialBatchState());

  // Parsed data from AI
  const [masterItems, setMasterItems] = useState<MasterMenuItem[]>([]);
  const [recipes, setRecipes] = useState<ParsedRecipe[]>([]);

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
    setSelectedStation("infer");
    setBatchState(createInitialBatchState());
    setMasterItems([]);
    setRecipes([]);
    setCombinedItems([]);
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

  // Extract sheets individually for multi-sheet workbooks with A1 cell value
  const extractSheetsFromWorkbook = (
    workbook: XLSX.WorkBook,
    fileName: string
  ): Array<{ sheetName: string; content: string; a1Value: string }> => {
    return workbook.SheetNames.map((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(worksheet, { blankrows: false });
      
      // Get raw A1 cell value for classification
      const a1Cell = worksheet['A1'];
      const a1Value = a1Cell ? String(a1Cell.v || '').trim().toUpperCase() : '';
      
      return { sheetName, content: csv, a1Value };
    });
  };

  // Process uploaded files with smart classification
  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      setBatchState((prev) => ({
        ...prev,
        isProcessing: true,
        processingProgress: 0,
        currentFile: "",
      }));

      const classifiedFiles: ClassifiedFile[] = [...batchState.files];
      const totalFiles = files.length;
      let processed = 0;

      for (const file of files) {
        setBatchState((prev) => ({
          ...prev,
          currentFile: file.name,
          processingProgress: Math.round((processed / totalFiles) * 100),
        }));

        try {
          let content: string;
          let sheets: Array<{ sheetName: string; content: string; a1Value: string }> = [];

          if (file.name.toLowerCase().endsWith(".csv")) {
            // Handle CSV files - extract A1 from first cell of first line
            content = await file.text();
            const firstLine = content.split('\n')[0] || '';
            const a1Value = firstLine.split(',')[0]?.replace(/"/g, '').trim().toUpperCase() || '';
            sheets = [{ sheetName: "CSV", content, a1Value }];
          } else {
            // Handle Excel files
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: "array" });
            sheets = extractSheetsFromWorkbook(workbook, file.name);
            content = sheets.map((s) => s.content).join("\n\n");
          }

          // Process each sheet - use A1 cell value for classification
          for (const sheet of sheets) {
            const fileType = classifyByA1(sheet.a1Value);
            const contentHash = generateContentHash(
              `${file.name}-${sheet.sheetName}`,
              sheet.content
            );

            const newFile: ClassifiedFile = {
              id: generateFileId(),
              fileName: file.name,
              sheetName: sheet.sheetName,
              fileType,
              content: sheet.content,
              contentHash,
              isDuplicate: false,
            };

            // Check for duplicates against existing files
            const duplicate = classifiedFiles.find(
              (existing) => !existing.isDuplicate && areDuplicates(existing, newFile)
            );

            if (duplicate) {
              newFile.isDuplicate = true;
              newFile.duplicateOf = duplicate.fileName;
            }

            classifiedFiles.push(newFile);
          }
        } catch (error) {
          console.error(`Error processing ${file.name}:`, error);
          classifiedFiles.push({
            id: generateFileId(),
            fileName: file.name,
            sheetName: "",
            fileType: "unknown",
            content: "",
            contentHash: "",
            isDuplicate: false,
            error: error instanceof Error ? error.message : "Failed to read file",
          });
        }

        processed++;
      }

      const newState = updateBatchCounts({
        ...batchState,
        files: classifiedFiles,
        isProcessing: false,
        processingProgress: 100,
        currentFile: "",
      });

      setBatchState(newState);

      toast({
        title: "Files Classified",
        description: `Found ${newState.menuItemCount} menu items, ${newState.recipeCount} recipes, ${newState.duplicateCount} duplicates`,
      });
    },
    [batchState, toast]
  );

  // Remove file from batch
  const handleRemoveFile = useCallback((id: string) => {
    setBatchState((prev) => {
      const filtered = prev.files.filter((f) => f.id !== id);
      return updateBatchCounts({ ...prev, files: filtered });
    });
  }, []);

  // Change file type manually
  const handleChangeFileType = useCallback((id: string, type: FileType) => {
    setBatchState((prev) => {
      const updated = prev.files.map((f) =>
        f.id === id ? { ...f, fileType: type } : f
      );
      return updateBatchCounts({ ...prev, files: updated });
    });
  }, []);

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
    const overlap = words1.filter((w) =>
      words2.some((w2) => w2.includes(w) || w.includes(w2))
    );
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

  // Get the effective station for an item
  const getEffectiveStation = (inferredStation: string): KitchenStation => {
    if (selectedStation !== "infer") {
      return selectedStation;
    }
    return (inferredStation as KitchenStation) || "line";
  };

  // Process classified files through AI
  const processFilesWithAI = async () => {
    setBatchState((prev) => ({
      ...prev,
      isProcessing: true,
      processingProgress: 0,
      currentFile: "Parsing with AI...",
    }));

    const menuItemFiles = batchState.files.filter(
      (f) => f.fileType === "menu_item" && !f.isDuplicate && !f.error
    );
    const recipeFiles = batchState.files.filter(
      (f) => f.fileType === "recipe" && !f.isDuplicate && !f.error
    );

    const totalFiles = menuItemFiles.length + recipeFiles.length;
    let processed = 0;
    const parsedMasterItems: MasterMenuItem[] = [];
    const parsedRecipes: ParsedRecipe[] = [];

    // Process menu item files
    for (const file of menuItemFiles) {
      setBatchState((prev) => ({
        ...prev,
        currentFile: file.fileName,
        processingProgress: Math.round((processed / totalFiles) * 100),
      }));

      try {
        const response = await supabase.functions.invoke("parse-master-menu", {
          body: { fileContent: file.content, fileName: file.fileName },
        });

        if (response.data?.menu_items) {
          parsedMasterItems.push(...response.data.menu_items);
        }
      } catch (error) {
        console.error(`Error parsing menu items from ${file.fileName}:`, error);
      }
      processed++;
    }

    // Process recipe files
    for (const file of recipeFiles) {
      setBatchState((prev) => ({
        ...prev,
        currentFile: file.fileName,
        processingProgress: Math.round((processed / totalFiles) * 100),
      }));

      try {
        const response = await supabase.functions.invoke("parse-menu-items", {
          body: { fileContent: file.content, fileName: file.fileName },
        });

        if (response.data?.menu_items) {
          parsedRecipes.push(
            ...response.data.menu_items.map((item: any) => ({
              ...item,
              fileName: file.fileName,
            }))
          );
        }
      } catch (error) {
        console.error(`Error parsing recipes from ${file.fileName}:`, error);
      }
      processed++;
    }

    setMasterItems(parsedMasterItems);
    setRecipes(parsedRecipes);

    setBatchState((prev) => ({
      ...prev,
      isProcessing: false,
      processingProgress: 100,
      currentFile: "",
    }));

    toast({
      title: "AI Parsing Complete",
      description: `Extracted ${parsedMasterItems.length} menu items and ${parsedRecipes.length} recipes`,
    });

    return { parsedMasterItems, parsedRecipes };
  };

  // Proceed to step 3: match items and check for duplicates
  const proceedToReview = async () => {
    // First, process files with AI
    const { parsedMasterItems, parsedRecipes } = await processFilesWithAI();

    // Then fetch existing data
    await fetchExistingData();

    let combined: CombinedItem[] = [];

    // Determine what we're importing based on classified files
    const hasMenuItems = parsedMasterItems.length > 0;
    const hasRecipes = parsedRecipes.length > 0;

    if (!hasMenuItems && hasRecipes) {
      // Only recipes - create combined items from recipes
      combined = parsedRecipes.map((recipe) => {
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
          itemImportType: "recipe" as ItemImportType,
          itemStation: effectiveStation,
        };
      });
    } else if (hasMenuItems) {
      // Menu items (or both) - use master items
      combined = parsedMasterItems.map((master) => {
        const match = parsedRecipes.find((r) => fuzzyMatch(master.name, r.name));
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
        const defaultImportType: ItemImportType = match ? "both" : "menu_item";

        return {
          masterItem: master,
          matchedRecipe: match || null,
          selected: true,
          duplicateStatus,
          existingMenuItemId: existingMenuItem?.id,
          existingRecipeId: existingRecipe?.id,
          itemImportType: defaultImportType,
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
        const isDuplicateMenuItem =
          item.duplicateStatus === "menu_exists" || item.duplicateStatus === "both_exist";
        const isDuplicateRecipe =
          item.duplicateStatus === "recipe_exists" || item.duplicateStatus === "both_exist";

        const shouldImportRecipe = item.itemImportType === "recipe" || item.itemImportType === "both";
        const shouldImportMenuItem =
          item.itemImportType === "menu_item" || item.itemImportType === "both";

        if (shouldImportMenuItem && isDuplicateMenuItem && duplicateHandling === "skip") {
          skippedItems++;
          continue;
        }

        let recipeId: string | null = null;

        // Handle recipe
        if (shouldImportRecipe && item.matchedRecipe) {
          if (isDuplicateRecipe && item.existingRecipeId) {
            if (duplicateHandling === "update") {
              const { error: recipeError } = await supabase
                .from("recipes")
                .update({
                  ingredients: item.matchedRecipe
                    .ingredients as unknown as Database["public"]["Tables"]["recipes"]["Update"]["ingredients"],
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
              ingredients: item.matchedRecipe
                .ingredients as unknown as Database["public"]["Tables"]["recipes"]["Insert"]["ingredients"],
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

        // Handle menu item
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
  const newItemsCount = combinedItems.filter(
    (item) => item.selected && item.duplicateStatus === "new"
  ).length;

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
    const validFiles = batchState.files.filter(
      (f) => !f.isDuplicate && !f.error && f.fileType !== "unknown"
    );
    return validFiles.length > 0 && !batchState.isProcessing;
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
            Smart Batch Import
            <Badge variant="outline" className="ml-2">
              Step {step} of 4
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Configure Station */}
        {step === 1 && (
          <div className="space-y-6 py-4">
            <div className="text-center space-y-2">
              <Sparkles className="h-16 w-16 mx-auto text-primary" />
              <h3 className="text-lg font-semibold">Smart Batch Import</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Drop multiple files at once. The system will automatically detect menu items vs
                recipes and filter out duplicates.
              </p>
            </div>

            <div className="space-y-6 max-w-md mx-auto">
              {/* Station Selection */}
              <div className="space-y-3">
                <Label className="text-base font-medium">
                  Default station for imported items
                </Label>
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

        {/* Step 2: Batch Upload */}
        {step === 2 && (
          <div className="flex flex-col max-h-[60vh] py-4">
            {/* Fixed: Station Summary + Drop Zone */}
            <div className="space-y-4 flex-shrink-0">
              {/* Station Summary */}
              <div className="flex items-center justify-center gap-4 text-sm bg-muted/50 rounded-lg p-3">
                <Badge variant="outline">Station: {getStationLabel()}</Badge>
              </div>

              {/* Drop Zone */}
              <BatchDropZone
                onFilesSelected={handleFilesSelected}
                isProcessing={batchState.isProcessing}
              />

              {/* Processing Progress */}
              {batchState.isProcessing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{batchState.currentFile}</span>
                    <span className="font-medium">{batchState.processingProgress}%</span>
                  </div>
                  <Progress value={batchState.processingProgress} className="h-2" />
                </div>
              )}

              {/* Summary Cards */}
              {batchState.files.length > 0 && !batchState.isProcessing && (
                <div className="grid grid-cols-4 gap-3">
                  <div className="rounded-lg border bg-green-500/10 border-green-500/30 p-3 text-center">
                    <div className="text-2xl font-bold text-green-600">{batchState.menuItemCount}</div>
                    <div className="text-xs text-muted-foreground">Menu Items</div>
                  </div>
                  <div className="rounded-lg border bg-blue-500/10 border-blue-500/30 p-3 text-center">
                    <div className="text-2xl font-bold text-blue-600">{batchState.recipeCount}</div>
                    <div className="text-xs text-muted-foreground">Recipes</div>
                  </div>
                  <div className="rounded-lg border bg-orange-500/10 border-orange-500/30 p-3 text-center">
                    <div className="text-2xl font-bold text-orange-600">{batchState.unknownCount}</div>
                    <div className="text-xs text-muted-foreground">Unknown</div>
                  </div>
                  <div className="rounded-lg border bg-yellow-500/10 border-yellow-500/30 p-3 text-center">
                    <div className="text-2xl font-bold text-yellow-600">{batchState.duplicateCount}</div>
                    <div className="text-xs text-muted-foreground">Duplicates</div>
                  </div>
                </div>
              )}
            </div>

            {/* Scrollable: File List + Warnings */}
            {batchState.files.length > 0 && !batchState.isProcessing && (
              <div className="flex-1 overflow-hidden mt-4 space-y-4">
                {/* Classified File List */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Classified Files</h4>
                  <ClassifiedFileList
                    files={batchState.files}
                    onRemoveFile={handleRemoveFile}
                    onChangeType={handleChangeFileType}
                  />
                </div>

                {/* Unknown files warning */}
                {batchState.unknownCount > 0 && (
                  <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400 bg-orange-500/10 rounded-lg p-3">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>
                      {batchState.unknownCount} file(s) couldn't be classified. You can manually set
                      their type or remove them.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Review & Match */}
        {step === 3 && (
          <div className="space-y-4">
            {isLoadingExisting || batchState.isProcessing ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">
                  {batchState.isProcessing ? batchState.currentFile : "Checking for duplicates..."}
                </span>
              </div>
            ) : (
              <>
                {/* Config Summary */}
                <div className="flex items-center gap-4 text-sm bg-muted/50 rounded-lg p-3">
                  <Badge variant="secondary">
                    {masterItems.length} Menu Items
                  </Badge>
                  <Badge variant="secondary">
                    {recipes.length} Recipes
                  </Badge>
                  <Badge variant="outline">Station: {getStationLabel()}</Badge>
                </div>

                {/* Duplicate handling controls */}
                {duplicateCount > 0 && (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                      <AlertCircle className="h-5 w-5" />
                      <span className="font-medium">
                        {duplicateCount} duplicate{duplicateCount > 1 ? "s" : ""} found in database
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
                      {combinedItems.length} items • {matchedCount} with recipes • {newItemsCount}{" "}
                      new
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
                            onValueChange={(value: ItemImportType) =>
                              updateItemImportType(index, value)
                            }
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
                            onValueChange={(value: KitchenStation) =>
                              updateItemStation(index, value)
                            }
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
                                  `Menu item already exists. Will ${
                                    duplicateHandling === "skip" ? "skip" : "update"
                                  }.`}
                                {item.duplicateStatus === "recipe_exists" &&
                                  `Recipe already exists. Will ${
                                    duplicateHandling === "skip" ? "link to existing" : "update existing"
                                  }.`}
                                {item.duplicateStatus === "both_exist" &&
                                  `Both menu item and recipe exist. Will ${
                                    duplicateHandling === "skip" ? "skip entirely" : "update both"
                                  }.`}
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
                                    variant={
                                      item.masterItem.cost_percent <= 35 ? "default" : "secondary"
                                    }
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
                                No recipe card matched. Menu item will be created without recipe
                                data.
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
              <Button
                onClick={proceedToReview}
                disabled={!canProceedFromStep2()}
              >
                {batchState.isProcessing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FolderUp className="mr-2 h-4 w-4" />
                )}
                Parse & Review
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
              <Button onClick={handleImport} disabled={isImporting || selectedCount === 0}>
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
