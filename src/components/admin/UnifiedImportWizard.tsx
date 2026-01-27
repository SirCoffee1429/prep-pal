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

// Type for ingredient structure in parsed items
interface ParsedApiIngredient {
  item: string;
  quantity?: string;
  measure?: string;
  unit_cost?: number;
  total_cost?: number;
}

// Type for parsed item from API response
interface ParsedApiItem {
  name?: string;
  station?: string;
  ingredients?: ParsedApiIngredient[];
  method?: string;
  recipe_cost?: number;
  portion_cost?: number;
}

interface ParsedItem {
  id: string;
  name: string;
  type: "menu_item" | "prep_recipe" | "sales_data";
  station: KitchenStation;
  status: "new" | "duplicate_menu" | "duplicate_recipe";
  existing_id?: string;
  original_data: ParsedApiItem;
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

          const { data, error } = await supabase.functions.invoke("analyze-document", {
            body: {
              fileContent: base64Content,
              fileName: file.name,
              mimeType: "application/pdf",
            },
          });

          if (error) {
            console.error(`Error parsing PDF ${file.name}:`, error);
          } else {
            if (data?.data?.menu_items && Array.isArray(data.data.menu_items)) {
              const pdfItems: ParsedItem[] = data.data.menu_items.map((item: ParsedApiItem, idx: number) => ({
                id: `${file.name}-${idx}`,
                name: item.name || "Unknown",
                type: "menu_item" as const,
                station: (item.station?.toLowerCase() as KitchenStation) || "grill",
                status: "new" as const,
                original_data: item,
                source_file: file.name,
              }));
              allParsedItems.push(...pdfItems);
            }

            if (data?.data?.recipes && Array.isArray(data.data.recipes)) {
              const recipeItems: ParsedItem[] = data.data.recipes.map((item: ParsedApiItem, idx: number) => ({
                id: `${file.name}-recipe-${idx}`,
                name: item.name || "Unknown Recipe",
                type: "prep_recipe" as const,
                station: "grill" as KitchenStation,
                status: "new" as const,
                original_data: item,
                source_file: file.name,
              }));
              allParsedItems.push(...recipeItems);
            }
          }
          processedCount++;
        } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
          const arrayBuffer = await file.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer);

          for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(worksheet);

            if (!csv.trim()) continue;

            const { data, error } = await supabase.functions.invoke("analyze-document", {
              body: {
                fileContent: csv,
                fileName: `${file.name} [${sheetName}]`,
                mimeType: "text/csv",
              },
            });

            if (error) {
              console.error(`Error parsing ${file.name} - ${sheetName}:`, error);
              continue;
            }

            if (data?.data?.menu_items && Array.isArray(data.data.menu_items)) {
              const sheetItems: ParsedItem[] = data.data.menu_items.map((item: ParsedApiItem, idx: number) => ({
                id: `${file.name}-${sheetName}-${idx}`,
                name: item.name || "Unknown",
                type: "menu_item" as const,
                station: (item.station?.toLowerCase() as KitchenStation) || "grill",
                status: "new" as const,
                original_data: item,
                source_file: `${file.name} • ${sheetName}`,
              }));
              allParsedItems.push(...sheetItems);
            }

            if (data?.data?.recipes && Array.isArray(data.data.recipes)) {
              const recipeItems: ParsedItem[] = data.data.recipes.map((item: ParsedApiItem, idx: number) => ({
                id: `${file.name}-${sheetName}-recipe-${idx}`,
                name: item.name || "Unknown Recipe",
                type: "prep_recipe" as const,
                station: "grill" as KitchenStation,
                status: "new" as const,
                original_data: item,
                source_file: `${file.name} • ${sheetName}`,
              }));
              allParsedItems.push(...recipeItems);
            }

            processedCount++;
          }
        } else {
          const textContent = await file.text();
          const { data, error } = await supabase.functions.invoke("analyze-document", {
            body: { fileContent: textContent, fileName: file.name, mimeType: "text/csv" },
          });

          if (!error && data?.data?.menu_items) {
            const fileItems: ParsedItem[] = data.data.menu_items.map((item: ParsedApiItem, idx: number) => ({
              id: `${file.name}-${idx}`,
              name: item.name || "Unknown",
              type: "menu_item" as const,
              station: (item.station?.toLowerCase() as KitchenStation) || "grill",
              status: "new" as const,
              original_data: item,
              source_file: file.name,
            }));
            allParsedItems.push(...fileItems);
          }

          if (!error && data?.data?.recipes) {
            const recipeItems: ParsedItem[] = data.data.recipes.map((item: ParsedApiItem, idx: number) => ({
              id: `${file.name}-recipe-${idx}`,
              name: item.name || "Unknown Recipe",
              type: "prep_recipe" as const,
              station: "grill" as KitchenStation,
              status: "new" as const,
              original_data: item,
              source_file: file.name,
            }));
            allParsedItems.push(...recipeItems);
          }

          processedCount++;
        }
      }

      setItems(allParsedItems);
      if (allParsedItems.length > 0) {
        setStep("review");
      }
      toast({
        title: "Processing Complete",
        description: `Scanned ${processedCount} sheets. Found ${allParsedItems.length} items.`,
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
      for (const item of items) {
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
                              <Select value={item.type} onValueChange={(val: string) => updateItem(item.id, "type", val)}>
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
                      Import {items.length} Items
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
