import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Combobox } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2, FileText, Sparkles, Calendar, Check, X } from "lucide-react";
import { findBestMatch, getConfidenceColor, getConfidenceLabel, type MatchResult } from "@/lib/itemMatching";

interface ParsedItem {
  name: string;
  quantity: number;
  original_name?: string;
  matched_item_id?: string;
  matched_item_name?: string;
  match_confidence?: MatchResult['confidence'];
}

interface MenuItem {
  id: string;
  name: string;
}

const SalesUpload = () => {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [salesDate, setSalesDate] = useState(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split("T")[0];
  });

  useEffect(() => {
    fetchMenuItems();
  }, []);

  const fetchMenuItems = async () => {
    try {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name")
        .eq("is_active", true);

      if (error) throw error;
      setMenuItems(data || []);
    } catch (error) {
      console.error("Error fetching menu items:", error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setParsedItems([]);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix if present
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleUploadAndParse = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a sales report file",
        variant: "destructive",
      });
      return;
    }

    setIsParsing(true);
    try {
      let fileContent: string;
      let isBase64 = false;

      // Handle PDF files with base64 encoding
      if (file.name.toLowerCase().endsWith('.pdf')) {
        fileContent = await readFileAsBase64(file);
        isBase64 = true;
      } else {
        // For text-based files (CSV, TXT, etc.)
        fileContent = await file.text();
      }

      // Send to AI for parsing
      const response = await supabase.functions.invoke("parse-sales", {
        body: {
          fileContent,
          fileName: file.name,
          menuItems: menuItems.map((m) => m.name),
          isBase64,
        },
      });

      // Handle rate limit and credit errors
      if (response.error) {
        const errorMessage = response.error.message || "";
        if (errorMessage.includes("429") || errorMessage.includes("Rate limit")) {
          toast({
            title: "Rate limit exceeded",
            description: "Please wait a moment and try again.",
            variant: "destructive",
          });
          return;
        }
        if (errorMessage.includes("402") || errorMessage.includes("credits")) {
          toast({
            title: "AI credits exhausted",
            description: "Please add credits to continue using AI features.",
            variant: "destructive",
          });
          return;
        }
        throw response.error;
      }

      const parsed: ParsedItem[] = response.data.items || [];

      // Match parsed items to menu items using fuzzy matching
      const matchedItems = parsed.map((item) => {
        const matchResult = findBestMatch(item.name, menuItems);
        return {
          ...item,
          matched_item_id: matchResult.item?.id,
          matched_item_name: matchResult.item?.name,
          match_confidence: matchResult.confidence,
        };
      });

      setParsedItems(matchedItems);
      
      const matchedCount = matchedItems.filter(i => i.matched_item_id).length;
      toast({
        title: "Parsing complete",
        description: `Found ${matchedItems.length} items, ${matchedCount} matched to menu`,
      });
    } catch (error) {
      console.error("Parse error:", error);
      toast({
        title: "Error",
        description: "Failed to parse sales file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleManualMatch = (index: number, menuItemId: string) => {
    setParsedItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        
        if (menuItemId === "none") {
          return {
            ...item,
            matched_item_id: undefined,
            matched_item_name: undefined,
            match_confidence: 'none' as const,
          };
        }
        
        const menuItem = menuItems.find((m) => m.id === menuItemId);
        return {
          ...item,
          matched_item_id: menuItemId,
          matched_item_name: menuItem?.name,
          match_confidence: 'exact' as const, // Manual selection is treated as exact
        };
      })
    );
  };

  const handleSaveSalesData = async () => {
    const matchedItems = parsedItems.filter((item) => item.matched_item_id);
    if (matchedItems.length === 0) {
      toast({
        title: "No matched items",
        description: "No items could be matched to your menu",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      // Aggregate duplicates: combine quantities for same menu_item_id
      const aggregatedMap = new Map<string, number>();
      matchedItems.forEach((item) => {
        const id = item.matched_item_id!;
        const existing = aggregatedMap.get(id) || 0;
        aggregatedMap.set(id, existing + item.quantity);
      });

      // Convert aggregated data to array format
      const salesData = Array.from(aggregatedMap.entries()).map(([menu_item_id, quantity_sold]) => ({
        menu_item_id,
        sales_date: salesDate,
        quantity_sold,
      }));

      const { error } = await supabase.from("sales_data").upsert(salesData, {
        onConflict: "menu_item_id,sales_date",
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Saved sales data for ${salesData.length} unique items`,
      });

      setFile(null);
      setParsedItems([]);
    } catch (error) {
      console.error("Save error:", error);
      toast({
        title: "Error",
        description: "Failed to save sales data",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleGeneratePrepList = async () => {
    setIsGenerating(true);
    try {
      const response = await supabase.functions.invoke("generate-prep-list", {
        body: { salesDate },
      });

      if (response.error) throw response.error;

      toast({
        title: "Prep list generated",
        description: `Created prep list with ${response.data.itemCount} items`,
      });
    } catch (error) {
      console.error("Generate error:", error);
      toast({
        title: "Error",
        description: "Failed to generate prep list",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const matchedCount = parsedItems.filter((i) => i.matched_item_id).length;
  const unmatchedCount = parsedItems.length - matchedCount;

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Sales Report
          </CardTitle>
          <CardDescription>
            Upload a PDF or Excel file with yesterday's sales data. AI will parse and extract menu items.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="salesFile">Sales Report File</Label>
              <Input
                id="salesFile"
                type="file"
                accept=".pdf,.csv,.xlsx,.xls,.txt"
                onChange={handleFileChange}
                className="cursor-pointer"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salesDate">Sales Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="salesDate"
                  type="date"
                  value={salesDate}
                  onChange={(e) => setSalesDate(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {file && (
            <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
              <FileText className="h-5 w-5 text-primary" />
              <span className="flex-1 truncate text-sm">{file.name}</span>
              <Button
                onClick={handleUploadAndParse}
                disabled={isParsing}
                size="sm"
              >
                {isParsing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Parse with AI
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Parsed Results */}
      {parsedItems.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Parsed Sales Data</CardTitle>
                <CardDescription>
                  Review and adjust matches. Use the dropdown to manually match unmatched items.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Badge variant="default" className="gap-1">
                  <Check className="h-3 w-3" />
                  {matchedCount} matched
                </Badge>
                {unmatchedCount > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <X className="h-3 w-3" />
                    {unmatchedCount} unmatched
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item (from report)</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead className="w-64">Menu Item</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedItems.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <span className="font-medium">{item.name}</span>
                      {item.original_name && item.original_name !== item.name && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (was: {item.original_name})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono">{item.quantity}</TableCell>
                    <TableCell>
                      <Badge
                        variant={item.match_confidence === 'none' ? 'outline' : 'secondary'}
                        className={getConfidenceColor(item.match_confidence || 'none')}
                      >
                        {getConfidenceLabel(item.match_confidence || 'none')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Combobox
                        value={item.matched_item_id || "none"}
                        onValueChange={(value) => handleManualMatch(idx, value)}
                        placeholder="Select menu item..."
                        searchPlaceholder="Search items..."
                        emptyText="No menu items found"
                        options={[
                          { value: "none", label: "No match" },
                          ...menuItems.map((m) => ({ value: m.id, label: m.name }))
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 flex gap-2">
              <Button onClick={handleSaveSalesData} disabled={isUploading || matchedCount === 0}>
                {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Sales Data ({matchedCount} items)
              </Button>
              <Button
                variant="secondary"
                onClick={handleGeneratePrepList}
                disabled={isGenerating}
              >
                {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Today's Prep List
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Generate */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Generate Prep List</CardTitle>
          <CardDescription>
            Generate today's prep list based on existing sales data and par levels
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleGeneratePrepList}
            disabled={isGenerating}
            variant="outline"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Prep List for Today
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SalesUpload;
