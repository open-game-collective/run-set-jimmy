import { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive";
  size?: "default" | "sm";
}

export function Button({ 
  variant = "default", 
  size = "default", 
  className, 
  children,
  ...props 
}: ButtonProps) {
  return (
    <button
      className={cn(
        "rounded-md font-medium transition-colors",
        variant === "default" && "bg-blue-600 text-white hover:bg-blue-700",
        variant === "destructive" && "bg-red-600 text-white hover:bg-red-700",
        size === "default" && "px-4 py-2",
        size === "sm" && "px-2 py-1 text-sm",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
} 