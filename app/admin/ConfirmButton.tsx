"use client";

// Submit button that asks before running a destructive or irreversible action.
export function ConfirmButton({ message, children, className = "button button-small" }: {
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button type="submit" className={className} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
