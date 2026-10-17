import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "danger";

/** Class of a button; also for links that look like one (`<Link className={buttonClass("secondary")}>`). */
export function buttonClass(variant: ButtonVariant = "primary", className?: string): string {
  return cn("button", variant !== "primary" && `button--${variant}`, className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** Form button; `type` defaults to submit because almost every button here submits a server action. */
export function Button({ variant, className, type = "submit", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, className)} {...rest} />;
}
