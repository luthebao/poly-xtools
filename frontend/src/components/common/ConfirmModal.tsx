import { ReactNode } from 'react';
import Button from './Button';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string | ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'primary';
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmModal({
    isOpen,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'danger',
    onConfirm,
    onCancel,
}: ConfirmModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/60"
                onClick={onCancel}
            />
            <div className="relative bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full mx-4 shadow-xl">
                <h3 className="text-lg font-semibold mb-2">{title}</h3>
                <div className="text-gray-300 mb-6">{message}</div>
                <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={onCancel}>
                        {cancelText}
                    </Button>
                    <Button variant={variant} onClick={onConfirm}>
                        {confirmText}
                    </Button>
                </div>
            </div>
        </div>
    );
}
