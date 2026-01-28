import React, { useEffect, useState } from 'react';
import { X, Undo2 } from 'lucide-react';

interface ToastProps {
    message: string;
    onUndo?: () => void;
    onClose: () => void;
    duration?: number;
}

export const Toast: React.FC<ToastProps> = ({ message, onUndo, onClose, duration = 5000 }) => {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsVisible(false);
            setTimeout(onClose, 300); // Wait for fade out animation
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onClose]);

    return (
        <div
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 bg-slate-800 text-white rounded-lg shadow-lg transition-all duration-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                }`}
        >
            <span className="text-sm">{message}</span>
            {onUndo && (
                <button
                    onClick={() => {
                        onUndo();
                        onClose();
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-white/20 hover:bg-white/30 rounded transition-colors"
                >
                    <Undo2 className="w-3.5 h-3.5" />
                    Undo
                </button>
            )}
            <button
                onClick={onClose}
                className="p-1 hover:bg-white/20 rounded transition-colors"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
};
