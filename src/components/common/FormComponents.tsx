import React from 'react';
import { AlertTriangle, Loader2, CheckCircle2, X } from 'lucide-react';

export interface FormErrorSummaryProps {
  title?: string;
  message?: string | null;
  fieldErrors?: Record<string, string> | string[] | null;
  onDismiss?: () => void;
  className?: string;
}

export const FormErrorSummary: React.FC<FormErrorSummaryProps> = ({
  title = "We could not save this record. Review the highlighted fields.",
  message,
  fieldErrors,
  onDismiss,
  className = ""
}) => {
  if (!message && (!fieldErrors || (Array.isArray(fieldErrors) ? fieldErrors.length === 0 : Object.keys(fieldErrors).length === 0))) {
    return null;
  }

  const errorsList: string[] = [];
  if (fieldErrors) {
    if (Array.isArray(fieldErrors)) {
      errorsList.push(...fieldErrors.filter(Boolean));
    } else {
      Object.values(fieldErrors).forEach(err => {
        if (typeof err === 'string' && err) errorsList.push(err);
      });
    }
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`sticky top-0 z-20 bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-900 shadow-sm mb-4 space-y-1.5 ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <p className="font-bold text-rose-950">{title}</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-rose-500 hover:text-rose-800 font-bold p-0.5 rounded-lg text-xs cursor-pointer"
            aria-label="Dismiss error summary"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {message && <p className="text-rose-800 text-[11px] pl-6">{message}</p>}

      {errorsList.length > 0 && (
        <ul className="list-disc list-inside text-[11px] text-rose-800 pl-6 space-y-0.5">
          {errorsList.map((err, idx) => (
            <li key={idx}>{err}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

export interface FieldErrorMessageProps {
  error?: string | null;
  id?: string;
  className?: string;
}

export const FieldErrorMessage: React.FC<FieldErrorMessageProps> = ({ error, id, className = "" }) => {
  if (!error) return null;
  return (
    <p
      id={id}
      className={`text-[11px] font-semibold text-rose-600 mt-1 flex items-center gap-1 ${className}`}
    >
      <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
      <span>{error}</span>
    </p>
  );
};

export function getFieldInputClass(hasError?: boolean, extraClass = ""): string {
  const base = "w-full p-2.5 border rounded-xl text-xs transition duration-150 outline-none";
  if (hasError) {
    return `${base} border-rose-500 bg-rose-50/20 text-slate-900 focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20 ${extraClass}`;
  }
  return `${base} border-slate-300 bg-white text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 ${extraClass}`;
}

export interface LoadingSubmitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isSubmitting?: boolean;
  isSuccess?: boolean;
  loadingText?: string;
  successText?: string;
  idleText: string;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'emerald' | 'amber' | 'indigo' | 'danger';
}

export const LoadingSubmitButton: React.FC<LoadingSubmitButtonProps> = ({
  isSubmitting = false,
  isSuccess = false,
  loadingText = "Saving...",
  successText = "Saved",
  idleText,
  icon,
  variant = 'emerald',
  disabled,
  className = "",
  type = "button",
  ...props
}) => {
  const variantStyles = {
    emerald: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm",
    primary: "bg-slate-900 hover:bg-slate-800 text-white shadow-sm",
    secondary: "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200",
    amber: "bg-amber-600 hover:bg-amber-700 text-white shadow-sm",
    indigo: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm",
    danger: "bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
  };

  return (
    <button
      type={type}
      disabled={isSubmitting || disabled}
      aria-busy={isSubmitting}
      className={`px-4 py-2.5 text-xs font-bold rounded-xl transition duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {isSubmitting ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{loadingText}</span>
        </>
      ) : isSuccess ? (
        <>
          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
          <span>{successText}</span>
        </>
      ) : (
        <>
          {icon}
          <span>{idleText}</span>
        </>
      )}
    </button>
  );
};

export interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onContinueEditing: () => void;
  onDiscardChanges: () => void;
  title?: string;
  message?: string;
}

export const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({
  isOpen,
  onContinueEditing,
  onDiscardChanges,
  title = "Unsaved Changes",
  message = "You have unsaved changes. Closing this form will discard them."
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 text-amber-600">
          <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">{title}</h4>
            <p className="text-xs text-slate-500 mt-0.5">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onContinueEditing}
            className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            Continue Editing
          </button>
          <button
            type="button"
            onClick={onDiscardChanges}
            className="px-3.5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-sm cursor-pointer"
          >
            Discard Changes
          </button>
        </div>
      </div>
    </div>
  );
};
