import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Upload, Trash2, Folder } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import ParSheetImportDialog from "./ParSheetImportDialog";

type KitchenStation = Database["public"]["Enums"]["kitchen_station"];

interface MenuItem {
  id: string;
  name: string;
  station: KitchenStation;
  unit: string;
}




const STATIONS: { value: KitchenStation; label: string }[] = [
  { value: "grill", label: "Grill" },
  { value: "saute", label: "Sauté" },
  { value: "fry", label: "Fry" },
  { value: "salad", label: "Salad" },
  { value: "line", label: "Line" },
];

const ParManagement = () => {
  const { toast } = useToast();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [parLevels, setParLevels] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [changes, setChanges] = useState<Map<string, number>>(new Map());
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Group menu items by station for accordion display
  const groupedByStation = useMemo(() => {
    return STATIONS.map((station) => ({
      ...station,
      items: menuItems.filter((item) => item.station === station.value),
    }));
  }, [menuItems]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [itemsRes, parsRes] = await Promise.all([
        supabase
          .from("menu_items")
          .select("id, name, station, unit")
          .eq("is_active", true)
          .order("station")
          .order("name"),
        supabase
          .from("par_levels")
          .select("menu_item_id, par_quantity"),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (parsRes.error) throw parsRes.error;

      setMenuItems(itemsRes.data || []);

      const parMap = new Map<string, number>();
      (parsRes.data || []).forEach((p) => {
        parMap.set(p.menu_item_id, p.par_quantity);
      });
      setParLevels(parMap);
      setChanges(new Map());
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to load par levels",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleParChange = (menuItemId: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setChanges((prev) => new Map(prev).set(menuItemId, numValue));
  };

  const getParValue = (menuItemId: string): number => {
    if (changes.has(menuItemId)) {
      return changes.get(menuItemId)!;
    }
    return parLevels.get(menuItemId) || 0;
  };

  const handleSave = async () => {
    if (changes.size === 0) {
      toast({ title: "No changes", description: "Nothing to save" });
      return;
    }

    setIsSaving(true);
    try {
      const upserts = Array.from(changes.entries()).map(([menu_item_id, par_quantity]) => ({
        menu_item_id,
        day_of_week: 0,
        par_quantity,
      }));

      const { error } = await supabase.from("par_levels").upsert(upserts, {
        onConflict: "menu_item_id,day_of_week",
      });

      if (error) throw error;

      toast({ title: "Success", description: "Par levels saved" });
      fetchData();
    } catch (error) {
      console.error("Error saving:", error);
      toast({
        title: "Error",
        description: "Failed to save par levels",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from("par_levels").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;

      toast({ title: "Success", description: "All par levels deleted" });
      fetchData();
    } catch (error) {
      console.error("Error deleting:", error);
      toast({
        title: "Error",
        description: "Failed to delete par levels",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
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
    <Card>
      <CardHeader>
        <CardTitle>Par Levels</CardTitle>
        <CardDescription>
          Set target stock levels for each menu item
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-4">
          <div className="flex gap-2 ml-auto">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isDeleting}>
                  {isDeleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete All Par Levels?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all par levels for all days and all items.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAll}>
                    Delete All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(true)}
            >
              <Upload className="mr-2 h-4 w-4" />
              Import Par Sheet
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || changes.size === 0}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        </div>

        {/* Station Accordion */}
        {menuItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No menu items found. Add items in the Menu Items tab.
          </div>
        ) : (
          <Accordion type="multiple" className="space-y-2">
            {groupedByStation.map((station) => (
              <AccordionItem
                key={station.value}
                value={station.value}
                className="border rounded-lg px-4"
              >
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex items-center gap-3">
                    <Folder className="h-5 w-5 text-muted-foreground" />
                    <span className="font-semibold">{station.label}</span>
                    <Badge variant="secondary" className="ml-2">
                      {station.items.length} items
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {station.items.length === 0 ? (
                    <div className="py-4 text-center text-muted-foreground">
                      No items in this station
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead className="w-32">Par Level</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {station.items.map((item) => (
                          <TableRow key={item.id} className="h-14">
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>{item.unit}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                value={getParValue(item.id)}
                                onChange={(e) => handleParChange(item.id, e.target.value)}
                                className="w-24 h-11"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>

      <ParSheetImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={fetchData}
      />
    </Card>
  );
};

export default ParManagement;
