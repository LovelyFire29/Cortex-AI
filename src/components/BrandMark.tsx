import { cn } from "@/lib/utils";

/**
 * Cortex brand mark — two offset rounded rectangles suggesting
 * a stack of documents / layered knowledge. Not a generic sparkle.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-4 w-4", className)}
      aria-hidden="true"
    >
      <rect
        x="3.5"
        y="6"
        width="12"
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        opacity="0.55"
      />
      <rect
        x="8.5"
        y="3"
        width="12"
        height="14"
        rx="2.5"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M11.5 8.5h6M11.5 11.5h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/20">
        <BrandMark className="h-[18px] w-[18px]" />
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight">Cortex</span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Knowledge base
        </span>
      </div>
    </div>
  );
}
