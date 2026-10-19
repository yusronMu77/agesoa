import type { ComponentProps } from "react";
import { Button as UiButton, buttonVariants } from "@agesoa/ui/components/button";
import { cn } from "@agesoa/ui/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "danger";

const VARIANT = { primary: "default", secondary: "secondary", danger: "destructive" } as const;

/** Class of a button; also for links that look like one (`<Link className={buttonClass("secondary")}>`). */
export function buttonClass(variant: ButtonVariant = "primary", className?: string): string {
  return cn(buttonVariants({ variant: VARIANT[variant] }), className);
}

interface ButtonProps extends Omit<ComponentProps<typeof UiButton>, "variant"> {
  variant?: ButtonVariant;
}

/** Form button; `type` defaults to submit because almost every button here submits a server action. */
export function Button({ variant = "primary", type = "submit", ...rest }: ButtonProps) {
  return <UiButton type={type} variant={VARIANT[variant]} {...rest} />;
}
