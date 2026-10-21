import { useI18n } from '../../i18n/useI18n';
import { useEffect, useId, useRef, useState } from 'react';

interface ConfirmDialogProps {
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
    onClose: () => void;
    returnFocus?: HTMLElement | null;
}

export function ConfirmDialog({ title, description, confirmLabel, onConfirm, onClose, returnFocus }: ConfirmDialogProps) {
    const { t } = useI18n();
    const dialog = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const descriptionId = useId();
    const working = useRef(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const element = dialog.current!;
        const opener = returnFocus || document.activeElement as HTMLElement | null;
        element.showModal();
        return () => {
            element.close();
            if (opener?.isConnected) opener.focus();
        };
    }, [returnFocus]);

    const cancel = () => { if (!working.current) onClose(); };
    return <dialog ref={dialog} role="alertdialog" aria-labelledby={titleId} aria-describedby={descriptionId}
        className="m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-xl border border-slate-200 bg-white p-5 text-slate-700 shadow-xl backdrop:bg-slate-900/30"
        onCancel={event => { event.preventDefault(); cancel(); }}
        onKeyDown={event => {
            event.stopPropagation();
            if (event.key !== 'Tab') return;
            const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
            const first = items[0]; const last = items.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}
        onClick={event => { if (event.target === event.currentTarget) cancel(); }}>
        <form onClick={event => event.stopPropagation()} onSubmit={async event => {
            event.preventDefault();
            if (working.current) return;
            working.current = true; setPending(true); setError('');
            try { await onConfirm(); onClose(); }
            catch { working.current = false; setPending(false); setError('Could not delete local records. Try again.'); }
        }}>
            <h2 id={titleId} className="text-base font-semibold">{title}</h2>
            <p id={descriptionId} className="mt-2 break-words text-sm text-slate-500">{description}</p>
            {error && <p role="alert" className="mt-3 text-xs text-red-600">{t(error)}</p>}
            <div className="mt-5 flex justify-end gap-2">
                <button type="button" autoFocus disabled={pending} onClick={cancel}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50">{t("Cancel")}</button>
                <button type="submit" disabled={pending}
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50">{pending ? t("Deleting…") : confirmLabel}</button>
            </div>
        </form>
    </dialog>;
}
