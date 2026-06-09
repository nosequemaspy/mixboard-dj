import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  children: ReactNode;
}

const variants = {
  primary: 'bg-accent hover:bg-accent-hover text-white',
  secondary: 'bg-bg-tertiary hover:bg-bg-hover text-text-primary border border-border',
  danger: 'bg-danger/20 hover:bg-danger/30 text-danger border border-danger/30',
  ghost: 'hover:bg-bg-tertiary text-text-secondary hover:text-text-primary',
};

const sizes = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
};

export function Button({ variant = 'secondary', size = 'md', children, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-md font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
