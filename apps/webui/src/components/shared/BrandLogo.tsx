import { cn } from "../../lib/utils";

export const BRAND_LOGO_SRC = "/brand-logo.png";

type BrandLogoProps = {
  label?: string;
  showText?: boolean;
  className?: string;
  imageClassName?: string;
  textClassName?: string;
};

export function BrandLogo({
  label = "Mery",
  showText = false,
  className,
  imageClassName,
  textClassName,
}: BrandLogoProps) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <img
        src={BRAND_LOGO_SRC}
        alt={showText ? "" : `${label} logo`}
        aria-hidden={showText ? true : undefined}
        className={cn("h-8 w-8 shrink-0 object-contain", imageClassName)}
      />
      {showText ? (
        <span className={cn("truncate font-semibold text-[color:var(--ink)]", textClassName)}>
          {label}
        </span>
      ) : null}
    </span>
  );
}
