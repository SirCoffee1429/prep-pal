import { useState, useCallback, useRef } from "react";
import { Upload, FileSpreadsheet, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface BatchDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing: boolean;
  acceptedTypes?: string;
  maxFiles?: number;
  acceptPdf?: boolean;
}

const BatchDropZone = ({
  onFilesSelected,
  isProcessing,
  acceptedTypes = ".xlsx,.xls,.csv,.pdf",
  maxFiles = 50,
  acceptPdf = true,
}: BatchDropZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFiles = useCallback(
    (files: FileList | File[]): File[] => {
      const fileArray = Array.from(files);
      const validExtensions = acceptedTypes.split(",").map((ext) => ext.trim().toLowerCase());

      const validFiles = fileArray.filter((file) => {
        const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
        return validExtensions.includes(ext);
      });

      if (validFiles.length !== fileArray.length) {
        setDragError(`Some files were skipped. Only ${acceptedTypes} files are accepted.`);
        setTimeout(() => setDragError(null), 3000);
      }

      if (validFiles.length > maxFiles) {
        setDragError(`Maximum ${maxFiles} files allowed. Only first ${maxFiles} will be processed.`);
        setTimeout(() => setDragError(null), 3000);
        return validFiles.slice(0, maxFiles);
      }

      return validFiles;
    },
    [acceptedTypes, maxFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (isProcessing) return;

      const files = validateFiles(e.dataTransfer.files);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [isProcessing, onFilesSelected, validateFiles]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isProcessing) {
        setIsDragging(true);
      }
    },
    [isProcessing]
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleClick = () => {
    if (!isProcessing && inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = validateFiles(e.target.files);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    }
    // Reset input to allow selecting same files again
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-8 transition-all cursor-pointer",
          isDragging
            ? "border-primary bg-primary/10 scale-[1.02]"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
          isProcessing && "opacity-50 cursor-not-allowed"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptedTypes}
          multiple
          onChange={handleInputChange}
          className="hidden"
          disabled={isProcessing}
        />

        <div
          className={cn(
            "rounded-full p-4 transition-colors",
            isDragging ? "bg-primary/20" : "bg-muted"
          )}
        >
          {isDragging ? (
            <FileSpreadsheet className="h-10 w-10 text-primary" />
          ) : (
            <Upload className="h-10 w-10 text-muted-foreground" />
          )}
        </div>

        <div className="text-center space-y-2">
          <p className="text-lg font-medium">
            {isDragging ? "Drop files here" : "Drag & Drop Files Here"}
          </p>
          <p className="text-sm text-muted-foreground">
            or click to browse
          </p>
          <p className="text-xs text-muted-foreground">
            Accepts: Excel, CSV{acceptPdf ? ", PDF" : ""} • Max {maxFiles} files
          </p>
        </div>
      </div>

      {dragError && (
        <div className="flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{dragError}</span>
          <button
            onClick={() => setDragError(null)}
            className="ml-auto hover:bg-yellow-500/20 rounded p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default BatchDropZone;
