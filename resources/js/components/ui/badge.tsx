import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const getVariantClasses = (variant: string) => {
    const variants = {
      default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
      secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
      destructive: "border-transparent bg-red-500 text-white hover:bg-red-600",
      outline: "text-foreground border-border",
      success: "border-transparent bg-cyan-100 text-cyan-800 hover:bg-cyan-200",
      warning: "border-transparent bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
      info: "border-transparent bg-blue-100 text-blue-800 hover:bg-blue-200",
    };
    
    return variants[variant as keyof typeof variants] || variants.default;
  };

  return (
    <div 
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        getVariantClasses(variant),
        className
      )} 
      {...props} 
    />
  )
}

export { Badge }
