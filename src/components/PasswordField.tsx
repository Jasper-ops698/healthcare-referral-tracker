import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * PasswordField — Standalone password input with eye toggle.
 *
 * Extracted as its own component (not inside Settings) to prevent
 * React from unmounting/remounting on every parent render.
 * This fixes the focus-loss bug where users had to click for each character.
 */
export default function PasswordField({
  label,
  value,
  onChange,
  placeholder = '',
  className = '',
  ...rest
}: PasswordFieldProps) {
  const [show, setShow] = useState(false);

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full px-3 py-2 pr-12 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${className}`}
          placeholder={placeholder}
          {...rest}
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()} // Prevent focus loss
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none p-1"
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
