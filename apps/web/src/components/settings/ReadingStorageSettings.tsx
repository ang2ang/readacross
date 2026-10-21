import { useState } from 'react';
import { useReadingStore } from '../../store/useReadingStore';
import { ConfirmDialog } from '../common/ConfirmDialog';

export function ReadingStorageSettings() {
    const usage = useReadingStore(state => state.usage);
    const [confirming, setConfirming] = useState(false);
    return <>
        <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>Local storage · {(usage / 1024 / 1024).toFixed(1)} / 100 MB</span>
            <button className="shrink-0 text-red-600 hover:underline" onClick={() => setConfirming(true)}>Clear local records</button>
        </div>
        {confirming && <ConfirmDialog title="Clear local records?" description="Deletes saved files, translations and reading positions."
            confirmLabel="Clear records" onConfirm={() => useReadingStore.getState().remove()} onClose={() => setConfirming(false)} />}
    </>;
}
