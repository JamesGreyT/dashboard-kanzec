import { InputHTMLAttributes, ReactNode } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  leading?: ReactNode;
}

export default function Input({ label, leading, className = "", ...rest }: Props) {
  return (
    <label className="flex flex-col gap-2">
      {label && <span className="eyebrow">{label}</span>}
      <div className="flex items-center gap-2 h-10 bg-paper-2 px-3 rounded-[10px] focus-within:ring-2 focus-within:ring-mark/35">
        {leading && <span className="text-ink-3">{leading}</span>}
        <input
          {...rest}
          className={`flex-1 bg-transparent text-body text-ink border-0 outline-none placeholder:italic placeholder:text-ink-3 ${className}`}
        />
      </div>
    </label>
  );
}
