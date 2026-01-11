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
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2, FileText, Sparkles, Calendar } from "lucide-react";

interface ParsedItem {
  name: string;
  quantity: number;
  matched_item_id?: string;
  matched_item_name?: string;
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
      // Read file content
      const text = await file.text();

      // Send to AI for parsing
      const response = await supabase.functions.invoke("parse-sales", {
        body: {
          fileContent: text,
          fileName: file.name,
          menuItems: menuItems.map((m) => m.name),
        },
      });

      if (response.error) throw response.error;

      const parsed: ParsedItem[] = response.data.items || [];

      // Match parsed items to menu items
      const matchedItems = parsed.map((item) => {
        const menuItem = menuItems.find(
          (m) => m.name.toLowerCase() === item.name.toLowerCase()
        );
        return {
          ...item,
          matched_item_id: menuItem?.id,
          matched_item_name: menuItem?.name,
        };
      });

      setParsedItems(matchedItems);
      toast({
        title: "Parsing complete",
        description: `Found ${matchedItems.length} items in the report`,
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
      // Upsert sales data
      const salesData = matchedItems.map((item) => ({
        menu_item_id: item.matched_item_id!,
        sales_date: salesDate,
        quantity_sold: item.quantity,
      }));

      const { error } = await supabase.from("sales_data").upsert(salesData, {
        onConflict: "menu_item_id,sales_date",
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Saved sales data for ${matchedItems.length} items`,
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
            <CardTitle>Parsed Sales Data</CardTitle>
            <CardDescription>
              Review the extracted items. Matched items will be saved to your sales data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item (from file)</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Matched Menu Item</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedItems.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>
                      {item.matched_item_name ? (
                        <span className="text-primary">{item.matched_item_name}</span>
                      ) : (
                        <span className="text-muted-foreground">Not matched</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 flex gap-2">
              <Button onClick={handleSaveSalesData} disabled={isUploading}>
                {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Sales Data
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
