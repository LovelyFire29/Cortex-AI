import { FileText, FileType2, FileCode2, File as FileIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function fileMeta(filename: string): {
  Icon: LucideIcon;
  label: string;
  tone: string;
} {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf")
    return {
      Icon: FileType2,
      label: "PDF",
      tone: "bg-[oklch(0.62_0.18_25/0.14)] text-[oklch(0.7_0.18_25)]",
    };
  if (ext === "md" || ext === "markdown")
    return {
      Icon: FileCode2,
      label: "MD",
      tone: "bg-[oklch(0.62_0.15_180/0.14)] text-[oklch(0.72_0.14_185)]",
    };
  if (ext === "txt")
    return {
      Icon: FileText,
      label: "TXT",
      tone: "bg-[oklch(0.62_0.14_268/0.16)] text-[oklch(0.78_0.12_268)]",
    };
  return {
    Icon: FileIcon,
    label: ext.toUpperCase() || "FILE",
    tone: "bg-muted text-muted-foreground",
  };
}
