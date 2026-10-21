import { useEffect, useRef, useState } from 'react';
import { FileText, MoreHorizontal } from 'lucide-react';
import { readingStorage } from '../../reading/storage';
import { digest } from '../../reading/policy';
import { locationLabel } from '../../reading/types';
import { useReadingStore } from '../../store/useReadingStore';
import { useFileStore } from '../../store/useFileStore';
import { ConfirmDialog } from '../common/ConfirmDialog';
import type { DocumentRecord } from '../../reading/types';

export function RecentReading() {
    const recent = useReadingStore(state => state.recent);
    const refresh = useReadingStore(state => state.refresh);
    const [error, setError] = useState('');
    const [menu, setMenu] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<{ record: DocumentRecord; trigger: HTMLElement | null } | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const expected = useRef<string | null>(null);
    useEffect(() => {
        if (!menu) return;
        const close = (event: PointerEvent) => { if (!(event.target as HTMLElement).closest('[data-reading-options]')) setMenu(null); };
        const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(null); };
        document.addEventListener('pointerdown', close); document.addEventListener('keydown', key);
        return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
    }, [menu]);
    if (!recent.length) return null;
    return <section className="w-full max-w-2xl mt-6 px-6" aria-label="Recent reading">
        <h2 className="text-sm font-medium text-slate-600 mb-2">Recent reading</h2>
        <div className="space-y-2">
            {recent.map(record => <div key={record.id} className="relative flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <FileText className="w-4 h-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1"><div className="truncate text-sm text-slate-700">{record.name}</div>
                    <div className="text-xs text-slate-400">{locationLabel(record.position) || 'Not started'} · {record.translationCount ? 'Translations saved' : 'No saved translations'}</div></div>
                <button className="text-xs font-medium text-blue-600 py-2 shrink-0" onClick={async () => {
                    setError('');
                    if (!record.fileBytes) { expected.current = record.id; input.current?.click(); return; }
                    try {
                        const blob = await readingStorage.file(record.id);
                        if (!blob) { await refresh(); expected.current = record.id; input.current?.click(); return; }
                        useFileStore.getState().setFile(new File([blob], record.name, { type: blob.type }));
                    } catch { setError('Could not reopen this file. Please select the original again.'); }
                }}>{record.fileBytes ? 'Continue' : 'Reselect file'}</button>
                <button data-reading-options aria-haspopup="menu" aria-label={`Options for ${record.name}`} aria-expanded={menu === record.id} className="p-2 text-slate-400 hover:bg-slate-100 rounded" onClick={() => setMenu(menu === record.id ? null : record.id)}><MoreHorizontal className="w-4 h-4" /></button>
                {menu === record.id && <div data-reading-options role="menu" className="absolute right-2 top-full z-10 bg-white rounded-lg border border-slate-200 shadow-lg p-1">
                    <button role="menuitem" className="text-xs text-red-600 p-2" onClick={event => {
                        const trigger = event.currentTarget.parentElement?.previousElementSibling as HTMLElement | null;
                        setMenu(null);
                        setDeleting({ record, trigger });
                    }}>Delete local record</button></div>}
            </div>)}
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
        <input ref={input} type="file" accept=".pdf,.epub" className="hidden" onChange={async event => {
            const file = event.target.files?.[0]; event.target.value = '';
            if (!file) return;
            try {
                if (expected.current && await digest(await file.arrayBuffer()) !== expected.current) {
                    setError('This file does not match the saved record. Reselect the original; a renamed copy is fine.'); return;
                }
                useFileStore.getState().setFile(file);
            } catch { setError('Could not read the selected file. Please try again.'); }
        }} />
        {deleting && <ConfirmDialog title="Delete local record?" description={deleting.record.name} confirmLabel="Delete record"
            returnFocus={deleting.trigger} onConfirm={() => useReadingStore.getState().remove(deleting.record.id)} onClose={() => setDeleting(null)} />}
    </section>;
}
