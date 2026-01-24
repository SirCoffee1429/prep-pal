import { useState } from "react";
import * as XLSX from "xlsx";
import { Upload, FileUp, Check, X, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ParsedItem {
  id: string;
  name: string;
  type: "menu_item" | "prep_recipe" | "sales_data";
  station: string;
  status: "new" | "duplicate_menu" | "duplicate_recipe";
  existing_id?: string;
  original_data: any;
  source_file: string; // Tracks which workbook/sheet it came from
}

export default function UnifiedImportWizard() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    const allParsedItems: ParsedItem[] = [];
    let processedCount = 0;

    try {
      // 1. LOOP THROUGH ALL UPLOADED FILES
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // A. Handle Excel Files (Split by Sheet)
        if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
          const arrayBuffer = await file.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer);

          // Loop through EVERY sheet in the workbook
          for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(worksheet);

            // Skip empty sheets
            if (!csv.trim()) continue;

            // Send sheet to backend
            const { data, error } = await supabase.functions.invoke("process-upload", {
              body: {
                fileContent: csv,
                fileName: `${file.name} [${sheetName}]`,
              },
            });

            if (error) {
              console.error(`Error parsing ${file.name} - ${sheetName}:`, error);
              continue;
            }

            if (data?.items) {
              const sheetItems = data.items.map((item: any) => ({
                ...item,
                source_file: `${file.name} • ${sheetName}`,
              }));
              allParsedItems.push(...sheetItems);
            }
            processedCount++;
          }
        }
        // B. Handle CSV/Text Files
        else {
          const textContent = await file.text();
          const { data, error } = await supabase.functions.invoke("process-upload", {
            body: { fileContent: textContent, fileName: file.name },
          });

          if (!error && data?.items) {
            const fileItems = data.items.map((item: any) => ({
              ...item,
              source_file: file.name,
            }));
            allParsedItems.push(...fileItems);
          }
          processedCount++;
        }
      }

      setItems(allParsedItems);
      setStep("review");
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
          await supabase.from("menu_items").upsert({
            ...(item.status === "duplicate_menu" && { id: item.existing_id }),
            name: item.name,
            recipe_id: null,
            station: item.station,
            menu_price: Number(item.original_data.menu_price) || 0,
          });
        } else if (item.type === "prep_recipe") {
          await supabase.from("recipes").upsert({
            ...(item.status === "duplicate_recipe" && { id: item.existing_id }),
            name: item.name,
            ingredients: item.original_data.ingredients,
            yield_amount: item.original_data.yield || 1,
            recipe_cost: Number(item.original_data.recipe_cost) || 0,
            portion_cost: Number(item.original_data.portion_cost) || 0,
          });
        }
        successCount++;
      }

      toast({ title: "Success!", description: `Imported ${successCount} items.` });
      setStep("upload");
      setItems([]);
    } catch (error) {
      console.error(error);
      toast({ title: "Import Failed", description: "Some items could not be saved.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-center space-x-4">
        <div className="p-3 bg-primary/10 rounded-full">
          <FileUp className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Unified Import</h2>
          <p className="text-muted-foreground">
            Upload multiple workbooks. We'll check every sheet for Menu Items and Recipes.
          </p>
        </div>
      </div>

      {/* STEP 1: UPLOAD */}
      {step === "upload" && (
        <Card className="border-dashed border-2 hover:bg-accent/50 transition-colors">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center">
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
                    <p className="text-sm text-muted-foreground">Supports multiple .xlsx or .xls files at once</p>
                  </div>
                  <Input
                    type="file"
                    multiple
                    accept=".csv,.xlsx,.xls"
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
          <CardHeader>
            <CardTitle>Review Detected Items</CardTitle>
            <CardDescription>
              Found <strong>{items.length} items</strong> across your uploaded files.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="border-b">
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Item Name</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                        Detected Type
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Station</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Source</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
                      <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b transition-colors hover:bg-muted/50">
                        {/* NAME */}
                        <td className="p-4">
                          <Input
                            value={item.name}
                            onChange={(e) => updateItem(item.id, "name", e.target.value)}
                            className="h-8 w-full min-w-[200px]"
                          />
                        </td>

                        {/* TYPE */}
                        <td className="p-4">
                          <Select value={item.type} onValueChange={(val: any) => updateItem(item.id, "type", val)}>
                            <SelectTrigger className="h-8 w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="menu_item">Menu Item</SelectItem>
                              <SelectItem value="prep_recipe">Prep Recipe</SelectItem>
                              <SelectItem value="sales_data">Sales Report</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>

                        {/* STATION */}
                        <td className="p-4">
                          {item.type === "menu_item" ? (
                            <Select value={item.station} onValueChange={(val) => updateItem(item.id, "station", val)}>
                              <SelectTrigger className="h-8 w-[120px]">
                                <SelectValue placeholder="Station" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Grill">Grill</SelectItem>
                                <SelectItem value="Saute">Saute</SelectItem>
                                <SelectItem value="Fry">Fry</SelectItem>
                                <SelectItem value="Salad">Salad</SelectItem>
                                <SelectItem value="Line">Line</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-muted-foreground text-xs pl-2">-</span>
                          )}
                        </td>

                        {/* SOURCE FILE */}
                        <td
                          className="p-4 text-xs text-muted-foreground max-w-[150px] truncate"
                          title={item.source_file}
                        >
                          {item.source_file}
                        </td>

                        {/* STATUS */}
                        <td className="p-4">
                          {item.status === "new" ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              New
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-yellow-50 text-yellow-700 border-yellow-200 flex items-center gap-1"
                            >
                              <AlertCircle className="w-3 h-3" /> Duplicate
                            </Badge>
                          )}
                        </td>

                        {/* DELETE */}
                        <td className="p-4 text-right">
                          <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
                            <X className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("upload");
                    setItems([]);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleFinalImport} disabled={isProcessing}>
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
  );
}
