import type { ButtonHTMLAttributes } from "preact";
import { SpinnerAlternative } from "./SpinnerAlternative";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

export function Button({
  loading,
  children,
  disabled,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`px-4 py-2 ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:opacity-90"} font-sans font-medium text-sm rounded-lg flex items-center justify-center gap-2 transition-all duration-200 bg-foreground text-background ${className ?? ""}`}
      disabled={disabled}
      {...props}
    >
      {loading && <SpinnerAlternative />}
      {children}
    </button>
  );
}
