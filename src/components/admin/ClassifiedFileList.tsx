import { FileSpreadsheet, X, AlertTriangle, Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ClassifiedFile, FileType } from "@/lib/fileClassification";

interface ClassifiedFileListProps {
  files: ClassifiedFile[];
  onRemoveFile: (id: string) => void;
  onChangeType: (id: string, type: FileType) => void;
}

const ClassifiedFileList = ({
  files,
  onRemoveFile,
  onChangeType,
}: ClassifiedFileListProps) => {
  if (files.length === 0) return null;

  const getTypeBadgeClass = (type: FileType, isDuplicate: boolean) => {
    if (isDuplicate) return "bg-yellow-600 hover:bg-yellow-700";
    switch (type) {
      case "menu_item":
        return "bg-green-600 hover:bg-green-700";
      case "recipe":
        return "bg-blue-600 hover:bg-blue-700";
      case "unknown":
        return "bg-orange-600 hover:bg-orange-700";
    }
  };

  const getTypeIcon = (type: FileType) => {
    switch (type) {
      case "menu_item":
        return "📊";
      case "recipe":
        return "📋";
      case "unknown":
        return "❓";
    }
  };

  return (
    <ScrollArea className="h-[280px]">
      <div className="space-y-2 pr-4">
        {files.map((file) => (
          <div
            key={file.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 transition-colors",
              file.isDuplicate && "border-yellow-500/50 bg-yellow-500/5",
              file.error && "border-destructive/50 bg-destructive/5"
            )}
          >
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium truncate text-sm">
                  {file.fileName}
                </span>
                {file.sheetName && file.sheetName !== "Sheet1" && (
                  <Badge variant="outline" className="text-xs">
                    {file.sheetName}
                  </Badge>
                )}
              </div>
              {file.error && (
                <p className="text-xs text-destructive mt-1">{file.error}</p>
              )}
              {file.isDuplicate && file.duplicateOf && (
                <div className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                  <Copy className="h-3 w-3" />
                  <span>Duplicate of: {file.duplicateOf}</span>
                </div>
              )}
            </div>

            {/* Type Badge/Selector */}
            {file.isDuplicate ? (
              <Badge className={getTypeBadgeClass(file.fileType, true)}>
                Duplicate
              </Badge>
            ) : (
              <Select
                value={file.fileType}
                onValueChange={(value: FileType) => onChangeType(file.id, value)}
              >
                <SelectTrigger className="w-[130px] h-8">
                  <SelectValue>
                    <span className="flex items-center gap-1.5">
                      <span>{getTypeIcon(file.fileType)}</span>
                      <span className="capitalize">
                        {file.fileType === "menu_item" ? "Menu Item" : file.fileType}
                      </span>
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="menu_item">
                    <span className="flex items-center gap-2">
                      📊 Menu Item
                    </span>
                  </SelectItem>
                  <SelectItem value="recipe">
                    <span className="flex items-center gap-2">
                      📋 Recipe
                    </span>
                  </SelectItem>
                  <SelectItem value="unknown">
                    <span className="flex items-center gap-2">
                      ❓ Unknown
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Remove Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => onRemoveFile(file.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};

export default ClassifiedFileList;
