/**
 * File classification and duplicate detection utilities for Smart Batch Upload
 */

export type FileType = "menu_item" | "recipe" | "unknown";

export interface ClassifiedFile {
  id: string;
  fileName: string;
  sheetName: string;
  fileType: FileType;
  content: string;
  contentHash: string;
  isDuplicate: boolean;
  duplicateOf?: string;
  error?: string;
}

export interface BatchUploadState {
  files: ClassifiedFile[];
  menuItemCount: number;
  recipeCount: number;
  unknownCount: number;
  duplicateCount: number;
  isProcessing: boolean;
  processingProgress: number;
  currentFile: string;
}

/**
 * Classify content based on header keywords
 * Checks first ~2000 characters for identifying text
 */
export function classifyContent(text: string): FileType {
  const upperText = text.toUpperCase().slice(0, 3000);
  
  // Check for Menu Item identifiers (typically green tabs in Excel)
  if (upperText.includes("MENU ITEM") || upperText.includes("FOOD COST SPREADSHEET") || upperText.includes("MENU PRICE")) {
    return "menu_item";
  }
  
  // Check for Recipe identifiers (typically blue tabs in Excel)
  if (
    upperText.includes("RECIPE") || 
    upperText.includes("PRODUCTION SPEC") || 
    upperText.includes("INGREDIENT") ||
    upperText.includes("METHOD") ||
    upperText.includes("PREP INSTRUCTION")
  ) {
    return "recipe";
  }
  
  return "unknown";
}

/**
 * Generate a content-based hash for duplicate detection
 * Uses normalized name and content fingerprint
 */
export function generateContentHash(fileName: string, content: string): string {
  // Normalize filename
  const normalizedName = fileName
    .toLowerCase()
    .replace(/\.(xlsx|xls|csv)$/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
  
  // Create content fingerprint from first 1000 chars
  const contentSample = content
    .slice(0, 1000)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
  
  // Simple hash: name + content length + content snippet
  return `${normalizedName}-${contentSample.length}-${contentSample.slice(0, 100)}`;
}

/**
 * Extract identifying items from content for smarter duplicate detection
 */
export function extractItemNames(content: string): string[] {
  const lines = content.split('\n').slice(0, 50); // Check first 50 lines
  const items: string[] = [];
  
  for (const line of lines) {
    // Skip empty lines and headers
    if (!line.trim() || line.includes('===')) continue;
    
    // Extract potential item names (first column typically)
    const parts = line.split(',');
    if (parts.length > 0 && parts[0].trim().length > 2) {
      const name = parts[0].trim().toLowerCase().replace(/[^a-z\s]/g, '');
      if (name.length > 2) {
        items.push(name);
      }
    }
  }
  
  return items.slice(0, 10); // Return first 10 items for comparison
}

/**
 * Check if two files are duplicates based on content similarity
 */
export function areDuplicates(file1: ClassifiedFile, file2: ClassifiedFile): boolean {
  // Same hash means duplicate
  if (file1.contentHash === file2.contentHash) {
    return true;
  }
  
  // Extract and compare item names
  const items1 = extractItemNames(file1.content);
  const items2 = extractItemNames(file2.content);
  
  if (items1.length < 3 || items2.length < 3) {
    return false; // Not enough data to compare
  }
  
  // Check overlap percentage
  const overlap = items1.filter(item => 
    items2.some(item2 => item.includes(item2) || item2.includes(item))
  );
  
  // If >70% overlap, consider duplicate
  const overlapPercent = overlap.length / Math.min(items1.length, items2.length);
  return overlapPercent > 0.7;
}

/**
 * Generate unique ID for file tracking
 */
export function generateFileId(): string {
  return `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get file type display info
 */
export function getFileTypeInfo(type: FileType): { label: string; color: string; icon: string } {
  switch (type) {
    case "menu_item":
      return { label: "Menu Item", color: "bg-green-600", icon: "📊" };
    case "recipe":
      return { label: "Recipe", color: "bg-blue-600", icon: "📋" };
    case "unknown":
      return { label: "Unknown", color: "bg-yellow-600", icon: "❓" };
  }
}

/**
 * Create initial batch upload state
 */
export function createInitialBatchState(): BatchUploadState {
  return {
    files: [],
    menuItemCount: 0,
    recipeCount: 0,
    unknownCount: 0,
    duplicateCount: 0,
    isProcessing: false,
    processingProgress: 0,
    currentFile: "",
  };
}

/**
 * Update batch state counts based on classified files
 */
export function updateBatchCounts(state: BatchUploadState): BatchUploadState {
  const files = state.files;
  return {
    ...state,
    menuItemCount: files.filter(f => f.fileType === "menu_item" && !f.isDuplicate).length,
    recipeCount: files.filter(f => f.fileType === "recipe" && !f.isDuplicate).length,
    unknownCount: files.filter(f => f.fileType === "unknown").length,
    duplicateCount: files.filter(f => f.isDuplicate).length,
  };
}
