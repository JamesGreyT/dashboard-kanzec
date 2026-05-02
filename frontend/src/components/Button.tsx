import { ButtonHTMLAttributes, ReactNode } from "react";
import { Button as ShadButton } from "@/components/ui/button";

type Variant = "primary" | "ghost" | "danger" | "link";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const variantMap: Record<Variant, "default" | "ghost" | "destructive" | "link"> = {
  primary: "default",
  ghost: "ghost",
  danger: "destructive",
  link: "link",
};

export default function Button({ variant = "ghost", children, ...rest }: Props) {
  return (
    <ShadButton variant={variantMap[variant]} {...rest}>
      {children}
    </ShadButton>
  );
}
