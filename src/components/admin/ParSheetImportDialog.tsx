import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, FileSpreadsheet, Check, AlertCircle } from "lucide-react";
import { findBestMatch, getConfidenceColor, getConfidenceLabel, MatchResult } from "@/lib/itemMatching";
import * as XLSX from "xlsx";

interface MenuItem {
  id: string;
  name: string;
}

interface ParsedItem {
  name: string;
  par_quantity: number;
  day_of_week: number | null;
  unit?: string;
}

interface ReviewItem extends ParsedItem {
  selected: boolean;
  matchResult: MatchResult;
  manualMatchId: string | null;
  editedQuantity: number;
}

interface ParSheetImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDay: number;
  onImportComplete: () => void;
}

const DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const ParSheetImportDialog = ({
  open,
  onOpenChange,
  selectedDay,
  onImportComplete,
}: ParSheetImportDialogProps) => {
  const { toast } = useToast();
  const [step, setStep] = useState<"upload" | "review" | "importing">("upload");
  const [isProcessing, setIsProcessing] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [importDay, setImportDay] = useState(selectedDay);
  const [dragActive, setDragActive] = useState(false);

  // Fetch menu items when dialog opens
  const fetchMenuItems = useCallback(async () => {
    const { data } = await supabase
      .from("menu_items")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    setMenuItems(data || []);
  }, []);

  // Handle dialog open
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      fetchMenuItems();
      setStep("upload");
      setReviewItems([]);
      setImportDay(selectedDay);
    }
    onOpenChange(newOpen);
  };

  // Read file content
  const readFileContent = async (file: File): Promise<{ content: string; isBase64: boolean }> => {
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith(".pdf")) {
      // Read as base64 for PDF
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          resolve({ content: base64, isBase64: true });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      // Parse Excel to text
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: "array" });
            let textContent = "";
            
            workbook.SheetNames.forEach((sheetName) => {
              const sheet = workbook.Sheets[sheetName];
              textContent += `Sheet: ${sheetName}\n`;
              textContent += XLSX.utils.sheet_to_csv(sheet) + "\n\n";
            });
            
            resolve({ content: textContent, isBase64: false });
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });
    } else if (fileName.endsWith(".csv")) {
      // Read as text
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ content: reader.result as string, isBase64: false });
        reader.onerror = reject;
        reader.readAsText(file);
      });
    } else {
      throw new Error("Unsupported file type. Please upload Excel, CSV, or PDF.");
    }
  };

  // Process uploaded file
  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    
    try {
      const { content, isBase64 } = await readFileContent(file);
      
      const mimeType = isBase64 ? "application/pdf" : "text/csv";
      
      const { data, error } = await supabase.functions.invoke("analyze-document", {
        body: {
          fileContent: content,
          fileName: file.name,
          mimeType,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Handle unified response structure for par_sheet type
      if (data?.type !== "par_sheet") {
        toast({
          title: "Unexpected File Type",
          description: `Expected a par sheet but detected ${data?.type || "unknown"}`,
          variant: "destructive",
        });
        return;
      }

      const parsedItems: ParsedItem[] = data.data?.items || [];
      
      if (parsedItems.length === 0) {
        toast({
          title: "No items found",
          description: "Could not extract any par level data from the file.",
          variant: "destructive",
        });
        return;
      }

      // Check if menu items exist before proceeding to review
      if (menuItems.length === 0) {
        toast({
          title: "No Menu Items Available",
          description: "Please import menu items first before importing par levels.",
          variant: "destructive",
        });
        return;
      }

      // Match items and prepare for review
      const reviews: ReviewItem[] = parsedItems.map((item) => {
        const matchResult = findBestMatch(item.name, menuItems);
        return {
          ...item,
          selected: matchResult.confidence !== "none",
          matchResult,
          manualMatchId: null,
          editedQuantity: item.par_quantity,
        };
      });

      setReviewItems(reviews);
      setStep("review");
      
      toast({
        title: "File parsed",
        description: `Found ${parsedItems.length} items`,
      });

    } catch (err) {
      console.error("Error processing file:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to process file",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [menuItems]);

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  // Toggle item selection
  const toggleItemSelection = (index: number) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, selected: !item.selected } : item
      )
    );
  };

  // Toggle all items
  const toggleAll = (selected: boolean) => {
    setReviewItems((prev) =>
      prev.map((item) => ({
        ...item,
        selected: selected && (item.matchResult.confidence !== "none" || item.manualMatchId !== null),
      }))
    );
  };

  // Update manual match
  const updateManualMatch = (index: number, menuItemId: string) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              manualMatchId: menuItemId || null,
              selected: menuItemId ? true : item.selected,
            }
          : item
      )
    );
  };

  // Update quantity
  const updateQuantity = (index: number, quantity: number) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, editedQuantity: quantity } : item
      )
    );
  };

  // Get the menu item ID to use for import
  const getMenuItemId = (item: ReviewItem): string | null => {
    if (item.manualMatchId) return item.manualMatchId;
    if (item.matchResult.item) return item.matchResult.item.id;
    return null;
  };

  // Handle import
  const handleImport = async () => {
    const itemsToImport = reviewItems.filter(
      (item) => item.selected && getMenuItemId(item)
    );

    if (itemsToImport.length === 0) {
      toast({
        title: "No items to import",
        description: "Select at least one matched item to import.",
        variant: "destructive",
      });
      return;
    }

    setStep("importing");

    try {
      const upserts = itemsToImport.map((item) => ({
        menu_item_id: getMenuItemId(item)!,
        day_of_week: importDay,
        par_quantity: item.editedQuantity,
      }));

      const { error } = await supabase.from("par_levels").upsert(upserts, {
        onConflict: "menu_item_id,day_of_week",
      });

      if (error) throw error;

      toast({
        title: "Import complete",
        description: `Updated ${itemsToImport.length} par levels for ${DAYS.find((d) => d.value === importDay)?.label}`,
      });

      onImportComplete();
      onOpenChange(false);

    } catch (err) {
      console.error("Import error:", err);
      toast({
        title: "Import failed",
        description: err instanceof Error ? err.message : "Failed to save par levels",
        variant: "destructive",
      });
      setStep("review");
    }
  };

  const selectedCount = reviewItems.filter((item) => item.selected && getMenuItemId(item)).length;
  const matchedCount = reviewItems.filter((item) => item.matchResult.confidence !== "none" || item.manualMatchId).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Par Sheet</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload a par sheet to extract and import par levels"}
            {step === "review" && `Review ${reviewItems.length} items before importing`}
            {step === "importing" && "Importing par levels..."}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="flex-1 flex flex-col gap-4">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              {isProcessing ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Processing file...</p>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <div className="flex flex-col items-center gap-3">
                    <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Drop par sheet here</p>
                      <p className="text-sm text-muted-foreground">
                        or click to browse (Excel, CSV, PDF)
                      </p>
                    </div>
                  </div>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.pdf"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Review */}
        {step === "review" && (
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            {/* Controls */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedCount === matchedCount && matchedCount > 0}
                  onCheckedChange={(checked) => toggleAll(!!checked)}
                />
                <span className="text-sm">Select All Matched</span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm text-muted-foreground">Import to:</span>
                <Select
                  value={importDay.toString()}
                  onValueChange={(v) => setImportDay(parseInt(v))}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((day) => (
                      <SelectItem key={day.value} value={day.value.toString()}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Summary */}
            <div className="text-sm text-muted-foreground">
              {selectedCount} of {reviewItems.length} items selected for import
            </div>

            {/* Items List */}
            <ScrollArea className="flex-1 h-[40vh] border rounded-md">
              <div className="p-2 space-y-2">
                {reviewItems.map((item, index) => {
                  const menuItemId = getMenuItemId(item);
                  const matchedName = item.manualMatchId
                    ? menuItems.find((m) => m.id === item.manualMatchId)?.name
                    : item.matchResult.item?.name;

                  return (
                    <div
                      key={index}
                      className={`p-3 rounded-md border transition-colors ${
                        item.selected && menuItemId
                          ? "bg-primary/5 border-primary/20"
                          : "bg-muted/30"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={item.selected && !!menuItemId}
                          disabled={!menuItemId}
                          onCheckedChange={() => toggleItemSelection(index)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Original name and confidence */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{item.name}</span>
                            {item.matchResult.confidence !== "none" && !item.manualMatchId && (
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${getConfidenceColor(
                                  item.matchResult.confidence
                                )} bg-current/10`}
                              >
                                {getConfidenceLabel(item.matchResult.confidence)}
                              </span>
                            )}
                            {item.manualMatchId && (
                              <span className="text-xs px-1.5 py-0.5 rounded text-blue-500 bg-blue-500/10">
                                Manual
                              </span>
                            )}
                          </div>

                          {/* Match dropdown or status */}
                          <div className="flex items-center gap-3 flex-wrap">
                            {item.matchResult.confidence === "none" && !item.manualMatchId ? (
                              <div className="flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 text-yellow-500" />
                                <Select
                                  value={item.manualMatchId || ""}
                                  onValueChange={(v) => updateManualMatch(index, v)}
                                >
                                  <SelectTrigger className="w-48 h-8 text-sm">
                                    <SelectValue placeholder="Select item..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {menuItems.map((m) => (
                                      <SelectItem key={m.id} value={m.id}>
                                        {m.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Check className="h-4 w-4 text-green-500" />
                                <span>→ {matchedName}</span>
                                {item.matchResult.confidence !== "exact" && (
                                  <Select
                                    value={item.manualMatchId || item.matchResult.item?.id || ""}
                                    onValueChange={(v) => updateManualMatch(index, v)}
                                  >
                                    <SelectTrigger className="w-40 h-7 text-xs">
                                      <SelectValue placeholder="Change..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {menuItems.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>
                                          {m.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                            )}

                            {/* Quantity input */}
                            <div className="flex items-center gap-2 ml-auto">
                              <span className="text-sm text-muted-foreground">Par:</span>
                              <Input
                                type="number"
                                min="0"
                                value={item.editedQuantity}
                                onChange={(e) =>
                                  updateQuantity(index, parseInt(e.target.value) || 0)
                                }
                                className="w-20 h-8"
                              />
                              {item.unit && (
                                <span className="text-xs text-muted-foreground">{item.unit}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={selectedCount === 0}>
                <Upload className="mr-2 h-4 w-4" />
                Import {selectedCount} Items
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Importing */}
        {step === "importing" && (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-muted-foreground">Saving par levels...</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ParSheetImportDialog;
