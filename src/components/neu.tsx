import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { playClick } from "@/lib/sound";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const neuButton = cva(
  "neu-btn inline-flex items-center justify-center gap-2 font-display font-semibold tracking-wide select-none outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "text-foreground",
        primary: "text-primary glow-primary",
        solid: "bg-gradient-primary text-primary-foreground glow-primary",
        accent: "text-accent glow-accent",
        danger: "text-destructive",
        muted: "text-muted-foreground",
      },
      size: {
        sm: "h-9 px-3 text-sm rounded-xl",
        md: "h-12 px-5 text-base rounded-2xl",
        lg: "h-16 px-8 text-lg rounded-3xl",
        key: "h-14 sm:h-16 text-xl rounded-2xl",
        icon: "h-11 w-11 rounded-full",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof neuButton> & { silent?: boolean };

export function NeuButton({ className, variant, size, onClick, silent, ...props }: Props) {
  return (
    <button
      type="button"
      className={cn(neuButton({ variant, size }), className)}
      onClick={(e) => {
        if (!silent) playClick();
        onClick?.(e);
      }}
      {...props}
    />
  );
}

export function NeuModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  dismissable = true,
}: {
  open: boolean;
  onOpenChange?: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  dismissable?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => (dismissable || o) && onOpenChange?.(o)}>
      <DialogContent
        className="neu border-0 max-w-md w-[calc(100%-2rem)] rounded-3xl max-h-[85vh] overflow-y-auto"
        onInteractOutside={(e) => !dismissable && e.preventDefault()}
        onEscapeKeyDown={(e) => !dismissable && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-primary">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function TeamDot({ color, className }: { color: string; className?: string }) {
  // team colour is user data, so it is applied inline rather than as a token
  return <span className={cn("inline-block h-3 w-3 rounded-full", className)} style={{ background: color, boxShadow: `0 0 10px ${color}` }} />;
}

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("mx-auto min-h-screen w-full max-w-xl px-4 py-6 pb-28", className)}>{children}</main>;
}
