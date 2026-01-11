import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BookOpen, Check, Clock, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type PrepStatus = Database["public"]["Enums"]["prep_status"];

interface PrepListItemProps {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  status: PrepStatus;
  hasRecipe: boolean;
  onStatusChange: (status: PrepStatus) => void;
  onViewRecipe: () => void;
}

const statusConfig = {
  open: {
    icon: Circle,
    label: "Open",
    bgClass: "bg-status-open",
    textClass: "text-status-open-foreground",
    borderClass: "border-status-open/50",
  },
  in_progress: {
    icon: Clock,
    label: "In Progress",
    bgClass: "bg-status-progress",
    textClass: "text-status-progress-foreground",
    borderClass: "border-status-progress/50",
  },
  completed: {
    icon: Check,
    label: "Done",
    bgClass: "bg-status-complete",
    textClass: "text-status-complete-foreground",
    borderClass: "border-status-complete/50",
  },
};

const PrepListItem = ({
  name,
  quantity,
  unit,
  status,
  hasRecipe,
  onStatusChange,
  onViewRecipe,
}: PrepListItemProps) => {
  const config = statusConfig[status];
  const StatusIcon = config.icon;

  const cycleStatus = () => {
    const next: Record<PrepStatus, PrepStatus> = {
      open: "in_progress",
      in_progress: "completed",
      completed: "open",
    };
    onStatusChange(next[status]);
  };

  return (
    <Card
      className={cn(
        "flex items-center gap-4 border-2 p-4 transition-all",
        config.borderClass,
        status === "completed" && "opacity-60"
      )}
    >
      {/* Status Button */}
      <button
        onClick={cycleStatus}
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl transition-transform active:scale-95",
          config.bgClass,
          config.textClass
        )}
        aria-label={`Change status from ${config.label}`}
      >
        <StatusIcon className="h-7 w-7" />
      </button>

      {/* Item Details */}
      <div className="flex-1 min-w-0">
        <h3
          className={cn(
            "text-lg font-semibold truncate",
            status === "completed" && "line-through"
          )}
        >
          {name}
        </h3>
        <p className="text-2xl font-bold text-primary">
          {quantity}{" "}
          <span className="text-base font-normal text-muted-foreground">
            {unit}
          </span>
        </p>
      </div>

      {/* Recipe Button */}
      {hasRecipe && (
        <Button
          variant="outline"
          size="icon"
          onClick={onViewRecipe}
          className="h-14 w-14 shrink-0"
          aria-label="View recipe"
        >
          <BookOpen className="h-6 w-6" />
        </Button>
      )}
    </Card>
  );
};

export default PrepListItem;
