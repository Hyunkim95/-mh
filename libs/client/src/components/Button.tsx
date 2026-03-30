import React from "react";

export interface ButtonProps {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'primarySm' | 'secondary' | 'icon' | 'ghost'
  disabled?: boolean
  className?: string
  id?: string
  "data-testid"?: string
}

export const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  className = "",
  id,
  "data-testid": dataTestId,
}) => {
  const baseStyles =
    "justify-center items-center font-medium pb-[13px] pt-[10px]";

  const variantStyles = {
    primary:
      "rounded-[23px] w-[220px] bg-[var(--laser-lemon-500)] text-black disabled:opacity-10",
    primarySm:
      "rounded-[23px] w-[141px] bg-[var(--laser-lemon-500)] text-black disabled:opacity-10",
    secondary:
      "rounded-[17px] px-4 py-2 w-fit font-small bg-transparent text-white border border-white hover:opacity-110 disabled:opacity-30",
    ghost:
      "rounded-[23px] w-[141px] bg-transparent border border-white/25 text-white/25 hover:opacity-110 disabled:opacity-30",
    icon: "rounded-[16px] max-w-[46px] bg-[var(--laser-lemon-500)] px-[14px] text-black hover:opacity-110 disabled:opacity-30",
  };

  // Apply custom inset shadow only for secondary variant
  const shadowStyle =
    variant === "secondary"
      ? { boxShadow: "inset 0 0 9px 0px rgba(255, 255, 255, 0.25)" }
      : {};

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      onClick={onClick}
      disabled={disabled}
      style={shadowStyle}
      id={id}
      data-testid={dataTestId}
    >
      {children}
    </button>
  );
};
