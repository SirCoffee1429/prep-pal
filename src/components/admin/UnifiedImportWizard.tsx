import { useState } from "react";
import * as XLSX from "xlsx";
import { Upload, FileUp, Check, X, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type KitchenStation = Database["public"]["Enums"]["kitchen_station"];

interface ParsedItem {
  id: string;
  name: string;
  type: "menu_item" | "prep_recipe" | "sales_data";
  station: KitchenStation;
  status: "new" | "duplicate_menu" | "duplicate_recipe" | "duplicate_db";
  existing_id?: string;
  original_data: any;
  source_file: string;
}

interface UnifiedImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export default function UnifiedImportWizard({ open, onOpenChange, onComplete }: UnifiedImportWizardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const { toast } = useToast();

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Normalize names for comparison
  const normalizeName = (name: string) => name.toLowerCase().trim();

  // Preflight: fetch existing names from DB to detect duplicates
  const fetchExistingNames = async () => {
    const [menuRes, recipeRes] = await Promise.all([
      supabase.from("menu_items").select("name"),
      supabase.from("recipes").select("name"),
    ]);

    const menuNames = new Set((menuRes.data || []).map((r) => normalizeName(r.name)));
    const recipeNames = new Set((recipeRes.data || []).map((r) => normalizeName(r.name)));

    return { menuNames, recipeNames };
  };

  const isRateLimitError = (err: any) => {
    const msg = `${err?.message || ""} ${err?.details || ""}`.toLowerCase();
    return msg.includes("429") || msg.includes("rate limit") || msg.includes("resource exhausted");
  };

  // Avoid hammering the AI API during multi-sheet imports.
  const invokeAnalyzeDocument = async (body: any) => {
    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await supabase.functions.invoke("analyze-document", { body });
      if (!res.error) return res;

      if (isRateLimitError(res.error) && attempt < maxRetries) {
        const backoffMs = Math.min(8000, 600 * Math.pow(2, attempt));
        await sleep(backoffMs);
        continue;
      }

      return res;
    }
  };

  const handleClose = () => {
    setStep("upload");
    setItems([]);
    onOpenChange(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    const allParsedItems: ParsedItem[] = [];
    let processedCount = 0;
    let skippedDuplicates = 0;

    // Preflight: fetch existing DB names before processing
    const { menuNames, recipeNames } = await fetchExistingNames();

    // Track seen item names to deduplicate across workbooks
    // (e.g., Mac and Cheese appears in Brisket, Combo Platter, Pulled Pork kits)
    const seenNames = new Set<string>();

    // Helper to add item only if not a duplicate within batch
    // Also marks items that exist in DB with duplicate_db status
    const addItemIfUnique = (item: ParsedItem) => {
      const normalizedName = normalizeName(item.name);

      // Skip duplicates within the batch
      if (seenNames.has(normalizedName)) {
        console.log(`Skipping duplicate: "${item.name}" (already in batch)`);
        skippedDuplicates++;
        return;
      }
      seenNames.add(normalizedName);

      // Check if exists in database
      const isInDb = (item.type === "menu_item" && menuNames.has(normalizedName)) ||
        (item.type === "prep_recipe" && recipeNames.has(normalizedName));

      allParsedItems.push({
        ...item,
        status: isInDb ? "duplicate_db" : "new",
      });
    };

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.name.toLowerCase().endsWith(".pdf")) {
          // Convert PDF to Base64 for vision AI processing
          const arrayBuffer = await file.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = "";
          bytes.forEach((b) => (binary += String.fromCharCode(b)));
          const base64Content = btoa(binary);

          const result = await invokeAnalyzeDocument({
            fileContent: base64Content,
            fileName: file.name,
            mimeType: "application/pdf",
          });

          const data = (result as any)?.data;
          const error = (result as any)?.error;

          if (error) {
            console.error(`Error parsing PDF ${file.name}:`, error);
            if (isRateLimitError(error)) {
              toast({
                title: "Rate limit exceeded",
                description: "Waiting briefly and continuing…",
                variant: "destructive",
              });
              // brief cooldown to reduce repeated 429s
              await sleep(1500);
            }
          } else {
            if (data?.data?.menu_items && Array.isArray(data.data.menu_items)) {
              const pdfItems: ParsedItem[] = data.data.menu_items.map((item: any, idx: number) => ({
                id: `${file.name}-${idx}`,
                name: item.name || "Unknown",
                type: "menu_item" as const,
                station: (item.station?.toLowerCase() as KitchenStation) || "grill",
                status: "new" as const,
                original_data: item,
                source_file: file.name,
              }));
              pdfItems.forEach(addItemIfUnique);
            }

            if (data?.data?.recipes && Array.isArray(data.data.recipes)) {
              const recipeItems: ParsedItem[] = data.data.recipes.map((item: any, idx: number) => ({
                id: `${file.name}-recipe-${idx}`,
                name: item.name || "Unknown Recipe",
                type: "prep_recipe" as const,
                station: "grill" as KitchenStation,
                status: "new" as const,
                original_data: item,
                source_file: file.name,
              }));
              recipeItems.forEach(addItemIfUnique);
            }
          }
          processedCount++;

          // Small delay between files to reduce bursting.
          await sleep(250);
        } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
          const arrayBuffer = await file.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer);

          for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(worksheet);

            if (!csv.trim()) continue;

            // === A1 CELL PRE-CHECK (per AGENTS.md rules) ===
            // Check cell A1 to determine type before AI processing:
            // - "MENU ITEM:" prefix → menu_item (sellable dish)
            // - "RECIPE:" prefix → prep_recipe (sub-component)
            const a1Value = (worksheet['A1']?.v || worksheet['A1']?.w || '').toString().trim().toUpperCase();
            const forcedType: "menu_item" | "prep_recipe" | null =
              a1Value.startsWith('MENU ITEM') ? 'menu_item' :
                a1Value.startsWith('RECIPE') ? 'prep_recipe' : null;

            if (forcedType) {
              console.log(`Sheet "${sheetName}" detected as ${forcedType} from A1: "${a1Value}"`);
            }

            const result = await invokeAnalyzeDocument({
              fileContent: csv,
              fileName: `${file.name} [${sheetName}]`,
              mimeType: "text/csv",
            });

            const data = (result as any)?.data;
            const error = (result as any)?.error;

            if (error) {
              console.error(`Error parsing ${file.name} - ${sheetName}:`, error);

              // If we hit a rate limit mid-workbook, back off a bit before continuing.
              if (isRateLimitError(error)) {
                toast({
                  title: "Rate limit exceeded",
                  description: "Waiting briefly and continuing…",
                  variant: "destructive",
                });
                await sleep(2000);
              }
              continue;
            }

            // If A1 tells us the type, use that and pull items from whichever array the AI returned
            if (forcedType) {
              // Collect all items from both arrays (AI might have put them in either)
              const allItems = [
                ...(data?.data?.menu_items || []),
                ...(data?.data?.recipes || []),
              ];

              const forcedItems: ParsedItem[] = allItems.map((item: any, idx: number) => ({
                id: `${file.name}-${sheetName}-${idx}`,
                name: item.name || "Unknown",
                type: forcedType,
                station: (item.station?.toLowerCase() as KitchenStation) ||
                  (item.inferred_station?.toLowerCase() as KitchenStation) || "grill",
                status: "new" as const,
                original_data: item,
                source_file: `${file.name} • ${sheetName}`,
              }));
              forcedItems.forEach(addItemIfUnique);
            } else {
              // No A1 indicator — fall back to AI's classification
              if (data?.data?.menu_items && Array.isArray(data.data.menu_items)) {
                const sheetItems: ParsedItem[] = data.data.menu_items.map((item: any, idx: number) => ({
                  id: `${file.name}-${sheetName}-${idx}`,
                  name: item.name || "Unknown",
                  type: "menu_item" as const,
                  station: (item.station?.toLowerCase() as KitchenStation) || "grill",
                  status: "new" as const,
                  original_data: item,
                  source_file: `${file.name} • ${sheetName}`,
                }));
                sheetItems.forEach(addItemIfUnique);
              }

              if (data?.data?.recipes && Array.isArray(data.data.recipes)) {
                const recipeItems: ParsedItem[] = data.data.recipes.map((item: any, idx: number) => ({
                  id: `${file.name}-${sheetName}-recipe-${idx}`,
                  name: item.name || "Unknown Recipe",
                  type: "prep_recipe" as const,
                  station: "grill" as KitchenStation,
                  status: "new" as const,
                  original_data: item,
                  source_file: `${file.name} • ${sheetName}`,
                }));
                recipeItems.forEach(addItemIfUnique);
              }
            }

            processedCount++;

            // Throttle between sheet calls to avoid API bursts.
            await sleep(300);
          }
        } else {
          const textContent = await file.text();
          const result = await invokeAnalyzeDocument({
            fileContent: textContent,
            fileName: file.name,
            mimeType: "text/csv",
          });

          const data = (result as any)?.data;
          const error = (result as any)?.error;

          if (!error && (data?.type === "sales" || data?.data?.items)) {
            const salesItems: ParsedItem[] = (data.data.items || []).map((item: any, idx: number) => ({
              id: `${file.name}-sales-${idx}`,
              name: item.name || "Unknown Item",
              type: "sales_data" as const,
              station: "line" as KitchenStation, // Default for sales (irrelevant)
              status: "new" as const,
              original_data: item,
              source_file: file.name,
            }));
            salesItems.forEach(addItemIfUnique);
          }

          if (!error && data?.data?.menu_items) {
            const fileItems: ParsedItem[] = data.data.menu_items.map((item: any, idx: number) => ({
              id: `${file.name}-${idx}`,
              name: item.name || "Unknown",
              type: "menu_item" as const,
              station: (item.station?.toLowerCase() as KitchenStation) || "grill",
              status: "new" as const,
              original_data: item,
              source_file: file.name,
            }));
            fileItems.forEach(addItemIfUnique);
          }

          if (!error && data?.data?.recipes) {
            const recipeItems: ParsedItem[] = data.data.recipes.map((item: any, idx: number) => ({
              id: `${file.name}-recipe-${idx}`,
              name: item.name || "Unknown Recipe",
              type: "prep_recipe" as const,
              station: "grill" as KitchenStation,
              status: "new" as const,
              original_data: item,
              source_file: file.name,
            }));
            recipeItems.forEach(addItemIfUnique);
          }

          processedCount++;

          await sleep(250);
        }
      }

      setItems(allParsedItems);
      if (allParsedItems.length > 0) {
        setStep("review");
      }
      toast({
        title: "Processing Complete",
        description: `Scanned ${processedCount} sheets. Found ${allParsedItems.length} unique items${skippedDuplicates > 0 ? ` (${skippedDuplicates} duplicates skipped)` : ''}.`,
      });
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to parse files.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const updateItem = (id: string, field: keyof ParsedItem, value: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleFinalImport = async () => {
    setIsProcessing(true);
    let successCount = 0;

    try {
      for (const item of items.filter(i => i.status !== "duplicate_db")) {
        if (item.type === "menu_item") {
          const { error } = await supabase.from("menu_items").insert({
            name: item.name,
            station: item.station,
            unit: "portions",
          });
          if (!error) successCount++;
        } else if (item.type === "prep_recipe") {
          const { error } = await supabase.from("recipes").insert({
            name: item.name,
            ingredients: item.original_data.ingredients || null,
            method: item.original_data.method || null,
            recipe_cost: item.original_data.recipe_cost ? Number(item.original_data.recipe_cost) : null,
            portion_cost: item.original_data.portion_cost ? Number(item.original_data.portion_cost) : null,
          });
          if (!error) successCount++;
        } else if (item.type === "sales_data") {
          // Best-effort match by name. 
          // Note: SalesUpload.tsx is preferred for sales as it supports manual matching and date selection.
          const { data: match } = await supabase
            .from("menu_items")
            .select("id")
            .ilike("name", item.name) // Use case-insensitive match
            .maybeSingle();

          if (match) {
            const { error } = await supabase.from("sales_data").insert({
              menu_item_id: match.id,
              quantity_sold: Number(item.original_data.quantity),
              sales_date: new Date(Date.now() - 86400000).toISOString().split('T')[0], // Default to Yesterday
            });
            if (!error) successCount++;
          }
        }
      }

      toast({ title: "Success!", description: `Imported ${successCount} items.` });
      handleClose();
      onComplete();
    } catch (error) {
      console.error(error);
      toast({ title: "Import Failed", description: "Some items could not be saved.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <FileUp className="h-5 w-5 text-primary" />
            </div>
            Unified Import
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* STEP 1: UPLOAD */}
          {step === "upload" && (
            <Card className="border-dashed border-2 hover:bg-accent/50 transition-colors">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center space-y-4 py-8 text-center">
                  {isProcessing ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-10 w-10 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Scanning all workbooks & sheets...</p>
                    </div>
                  ) : (
                    <>
                      <div className="p-4 bg-muted rounded-full">
                        <Upload className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-semibold text-lg">Drag & drop files here</h3>
                        <p className="text-sm text-muted-foreground">Supports Excel, CSV, and PDF files</p>
                      </div>
                      <Input
                        type="file"
                        multiple
                        accept=".csv,.xlsx,.xls,.pdf"
                        className="max-w-xs cursor-pointer"
                        onChange={handleFileUpload}
                      />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 2: REVIEW */}
          {step === "review" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Review Detected Items</CardTitle>
                <CardDescription>
                  Found <strong>{items.length} items</strong> across your uploaded files.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="rounded-md border overflow-hidden max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr className="border-b">
                          <th className="h-10 px-3 text-left font-medium text-muted-foreground">Name</th>
                          <th className="h-10 px-3 text-left font-medium text-muted-foreground">Type</th>
                          <th className="h-10 px-3 text-left font-medium text-muted-foreground">Station</th>
                          <th className="h-10 px-3 text-left font-medium text-muted-foreground">Source</th>
                          <th className="h-10 px-3 text-left font-medium text-muted-foreground">Status</th>
                          <th className="h-10 px-3 w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id} className="border-b hover:bg-muted/50">
                            <td className="p-2">
                              <Input
                                value={item.name}
                                onChange={(e) => updateItem(item.id, "name", e.target.value)}
                                className="h-8 min-w-[180px]"
                              />
                            </td>
                            <td className="p-2">
                              <Select value={item.type} onValueChange={(val: any) => updateItem(item.id, "type", val)}>
                                <SelectTrigger className="h-8 w-[130px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="menu_item">Menu Item</SelectItem>
                                  <SelectItem value="prep_recipe">Recipe</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-2">
                              {item.type === "menu_item" ? (
                                <Select
                                  value={item.station}
                                  onValueChange={(val) => updateItem(item.id, "station", val)}
                                >
                                  <SelectTrigger className="h-8 w-[100px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="grill">Grill</SelectItem>
                                    <SelectItem value="saute">Sauté</SelectItem>
                                    <SelectItem value="fry">Fry</SelectItem>
                                    <SelectItem value="salad">Salad</SelectItem>
                                    <SelectItem value="line">Line</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="p-2 text-xs text-muted-foreground max-w-[120px] truncate" title={item.source_file}>
                              {item.source_file}
                            </td>
                            <td className="p-2">
                              {item.status === "new" ? (
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                                  New
                                </Badge>
                              ) : item.status === "duplicate_db" ? (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" /> In Database
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" /> Dup
                                </Badge>
                              )}
                            </td>
                            <td className="p-2">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(item.id)}>
                                <X className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <Button variant="outline" onClick={handleClose}>
                      Cancel
                    </Button>
                    <Button onClick={handleFinalImport} disabled={isProcessing || items.length === 0}>
                      {isProcessing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      Import {items.filter(i => i.status !== "duplicate_db").length} Items
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
