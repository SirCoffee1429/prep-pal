import { useState, useEffect } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Upload } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import ParSheetImportDialog from "./ParSheetImportDialog";

type KitchenStation = Database["public"]["Enums"]["kitchen_station"];

interface MenuItem {
  id: string;
  name: string;
  station: KitchenStation;
  unit: string;
}

interface ParLevel {
  menu_item_id: string;
  day_of_week: number;
  par_quantity: number;
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
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [selectedStation, setSelectedStation] = useState<KitchenStation | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [changes, setChanges] = useState<Map<string, number>>(new Map());
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectedDay]);

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
          .select("menu_item_id, day_of_week, par_quantity")
          .eq("day_of_week", selectedDay),
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
        day_of_week: selectedDay,
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

  const filteredItems =
    selectedStation === "all"
      ? menuItems
      : menuItems.filter((item) => item.station === selectedStation);

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
          Set target stock levels for each menu item by day of the week
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-4">
          <div className="w-48">
            <Select
              value={selectedDay.toString()}
              onValueChange={(v) => setSelectedDay(parseInt(v))}
            >
              <SelectTrigger>
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
          <div className="w-48">
            <Select
              value={selectedStation}
              onValueChange={(v) => setSelectedStation(v as KitchenStation | "all")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stations</SelectItem>
                {STATIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 ml-auto">
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

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Station</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="w-32">Par Level</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No menu items found. Add items in the Menu Items tab.
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="capitalize">{item.station}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      value={getParValue(item.id)}
                      onChange={(e) => handleParChange(item.id, e.target.value)}
                      className="w-24"
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <ParSheetImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        selectedDay={selectedDay}
        onImportComplete={fetchData}
      />
    </Card>
  );
};

export default ParManagement;
