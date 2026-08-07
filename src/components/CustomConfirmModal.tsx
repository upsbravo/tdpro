import React from 'react';
import { AlertTriangle, Trash2, HelpCircle, Info, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CustomConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  theme?: 'cosmic_dark' | 'enterprise_light' | 'industrial_terminal';
  type?: 'danger' | 'warning' | 'info';
}

export default function CustomConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  theme = 'enterprise_light',
  type = 'info'
}: CustomConfirmModalProps) {
  // Set colors based on theme and type
  const isDark = theme === 'cosmic_dark';
  const isTerminal = theme === 'industrial_terminal';

  // Backdrop classes
  const backdropClass = "fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm";

  // Card background and text classes
  let cardBg = "bg-white text-slate-800 border-slate-200";
  let titleColor = "text-slate-900";
  let messageColor = "text-slate-600";
  let footerBg = "bg-slate-50 border-slate-100";
  let cancelBtnClass = "border-slate-200 text-slate-700 bg-white hover:bg-slate-50";

  if (isDark) {
    cardBg = "bg-slate-900 text-slate-100 border-slate-800/80";
    titleColor = "text-white";
    messageColor = "text-slate-300";
    footerBg = "bg-slate-950/40 border-slate-800/50";
    cancelBtnClass = "border-slate-800 text-slate-300 bg-slate-950 hover:bg-slate-900";
  } else if (isTerminal) {
    cardBg = "bg-zinc-950 text-amber-500 border-amber-500/30 font-mono";
    titleColor = "text-amber-500";
    messageColor = "text-amber-600/90";
    footerBg = "bg-zinc-900/50 border-amber-500/10";
    cancelBtnClass = "border-amber-500/30 text-amber-500 bg-zinc-950 hover:bg-zinc-900";
  }

  // Type-specific styles
  let icon = <HelpCircle className="h-5 w-5 text-indigo-500" />;
  let confirmBtnClass = "bg-indigo-600 hover:bg-indigo-700 text-white";

  if (type === 'danger') {
    icon = <Trash2 className="h-5 w-5 text-rose-500" />;
    if (isTerminal) {
      confirmBtnClass = "bg-amber-600/20 hover:bg-amber-600/40 text-amber-500 border border-amber-500";
    } else {
      confirmBtnClass = "bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/15";
    }
  } else if (type === 'warning') {
    icon = <AlertTriangle className="h-5 w-5 text-amber-500" />;
    if (isTerminal) {
      confirmBtnClass = "bg-amber-600/20 hover:bg-amber-600/40 text-amber-500 border border-amber-500";
    } else {
      confirmBtnClass = "bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/15";
    }
  } else {
    // Info
    icon = <Info className="h-5 w-5 text-indigo-500" />;
    if (isDark) {
      confirmBtnClass = "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/15";
    } else if (isTerminal) {
      confirmBtnClass = "bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold";
    } else {
      confirmBtnClass = "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/15";
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={backdropClass}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl flex flex-col ${cardBg}`}
            id="custom-confirm-modal"
          >
            {/* Header */}
            <div className="p-5 flex items-start gap-4">
              <div className={`p-2.5 rounded-xl shrink-0 ${
                isTerminal ? 'bg-amber-500/10' : isDark ? 'bg-slate-800/80' : 'bg-slate-100'
              }`}>
                {icon}
              </div>
              <div className="space-y-1.5 flex-1 min-w-0">
                <h3 className={`text-sm font-bold tracking-tight ${titleColor}`}>
                  {title}
                </h3>
                <p className={`text-xs leading-relaxed ${messageColor}`}>
                  {message}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className={`flex justify-end gap-2.5 p-4 border-t shrink-0 ${footerBg}`}>
              <button
                type="button"
                onClick={onCancel}
                className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition ${cancelBtnClass}`}
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition ${confirmBtnClass}`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
