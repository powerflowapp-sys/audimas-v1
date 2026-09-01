import React from 'react';
import { AlertTriangle, Trash2, X, RefreshCw } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isProcessing?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Sí, Eliminar',
  cancelText = 'Cancelar',
  isProcessing = false,
  onClose,
  onConfirm
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 animate-fade-in">
      <div 
        className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-2xl text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icono Destructivo */}
        <div className="w-14 h-14 bg-red-500/20 text-red-500 rounded-2xl flex items-center justify-center mx-auto border border-red-500/30 shadow-lg shadow-red-500/10">
          <Trash2 className="w-7 h-7" />
        </div>

        {/* Título y Mensaje */}
        <div className="space-y-1.5">
          <h3 className="font-extrabold text-base text-white">{title}</h3>
          <p className="text-xs text-slate-400 leading-relaxed px-2">
            {message}
          </p>
        </div>

        {/* Botones de Acción */}
        <div className="flex items-center space-x-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-750 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className="flex-1 py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-600/30 flex items-center justify-center space-x-1.5 transition-all disabled:opacity-50 disabled:shadow-none"
          >
            {isProcessing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>{confirmText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
