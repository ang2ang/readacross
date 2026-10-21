import { useI18n } from '../../i18n/useI18n';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { clampPanelWidth } from '../../reading/policy';

export function TranslationShell({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
    const { t } = useI18n();
    const [available, setAvailable] = useState(() => window.innerWidth);
    const [preferred, setPreferred] = useState(() => {
        try { return Number(localStorage.getItem('readacross-panel-width')) || 384; } catch { return 384; }
    });
    const [menu, setMenu] = useState(false);
    const handle = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{ x: number; width: number; moved: boolean } | null>(null);
    const drawer = available < 1024;
    const width = clampPanelWidth(preferred, available);
    const change = (next: number) => {
        const value = clampPanelWidth(next, available);
        setPreferred(value);
        try { localStorage.setItem('readacross-panel-width', String(value)); } catch { /* Optional preference. */ }
    };
    useEffect(() => {
        const observer = new ResizeObserver(entries => setAvailable(entries[0].contentRect.width));
        const parent = handle.current?.parentElement?.parentElement;
        if (parent) observer.observe(parent);
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        if (!open || !drawer) return;
        const previous = document.activeElement as HTMLElement | null;
        const frame = requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>('[data-close-translation]')?.focus());
        const trap = (event: KeyboardEvent) => {
            if (event.key !== 'Tab' || !panel.current) return;
            if (document.querySelector('dialog[open], [data-reader-modal]')) return;
            const items = [...panel.current.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')]
                .filter(element => element.getClientRects().length);
            const first = items[0]; const last = items.at(-1);
            if (event.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) {
                event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !panel.current.contains(document.activeElement))) {
                event.preventDefault(); first?.focus();
            }
        };
        document.addEventListener('keydown', trap);
        return () => {
            cancelAnimationFrame(frame); document.removeEventListener('keydown', trap);
            if (previous?.isConnected) previous.focus();
        };
    }, [open, drawer]);
    useEffect(() => {
        if (!open) return;
        const keydown = (event: KeyboardEvent) => {
            if (document.querySelector('dialog[open], [data-reader-modal]')) return;
            if (event.key === 'Escape') { if (menu && !drawer) { setMenu(false); handle.current?.focus(); } else if (drawer && !panel.current?.querySelector('[role=menu]')) onClose(); }
        };
        const outside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node) && !handle.current?.contains(event.target as Node)) setMenu(false); };
        document.addEventListener('keydown', keydown);
        document.addEventListener('pointerdown', outside);
        return () => { document.removeEventListener('keydown', keydown); document.removeEventListener('pointerdown', outside); };
    }, [open, menu, drawer, onClose]);
    return <>
        {open && drawer && <button tabIndex={-1} aria-label={t("Close translation overlay")} onClick={onClose} className="fixed inset-0 z-30 bg-slate-900/20" />}
        <aside ref={panel} role={drawer ? 'dialog' : undefined} aria-modal={drawer || undefined} aria-label={t("Translation panel")} style={{ display: open ? 'flex' : 'none', width: drawer ? Math.min(384, available) : width }}
            className={`${drawer ? 'fixed right-0 top-14 bottom-0 z-40' : 'relative h-full shrink-0'} min-w-0 bg-white border-l border-slate-200 shadow-lg`}>
            <button ref={handle} aria-label={t("Adjust translation width")} aria-haspopup="menu" aria-expanded={menu} title={t("Drag to resize; double-click to reset")}
                className={`${drawer ? 'hidden' : ''} absolute -left-2 top-0 bottom-0 w-4 z-20 cursor-col-resize touch-none focus-visible:outline-2 focus-visible:outline-blue-500 group`}
                onPointerDown={event => {
                    if (event.button !== 0) return;
                    drag.current = { x: event.clientX, width, moved: false };
                    event.currentTarget.setPointerCapture(event.pointerId);
                }} onPointerMove={event => {
                    if (!drag.current) return;
                    if (Math.abs(event.clientX - drag.current.x) > 3) drag.current.moved = true;
                    if (drag.current.moved) change(drag.current.width + drag.current.x - event.clientX);
                }} onPointerUp={event => {
                    const moved = drag.current?.moved;
                    drag.current = null;
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                    if (!moved) setMenu(value => !value);
                }} onPointerCancel={() => { drag.current = null; }} onDoubleClick={() => { change(384); setMenu(false); }}
                onClick={event => { if (event.detail === 0) setMenu(value => !value); }}
                onKeyDown={event => {
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                        event.preventDefault(); event.stopPropagation(); change(width + (event.key === 'ArrowLeft' ? 32 : -32));
                    }
                }}><span className="absolute left-1.5 top-1/2 h-10 w-1 rounded-full bg-slate-300 group-hover:bg-blue-400" /></button>
            {menu && !drawer && <div ref={menuRef} role="menu" aria-label={t("Panel width")} className="absolute left-2 top-2 z-30 bg-white shadow-lg border border-slate-200 rounded-lg p-1 text-xs">
                {[['Wider', width + 32], ['Narrower', width - 32], ['Reset width', 384]].map(([label, value]) =>
                    <button role="menuitem" key={label} className="block w-full text-left px-3 py-2 hover:bg-slate-50" onClick={() => { change(Number(value)); setMenu(false); handle.current?.focus(); }}>{t(String(label))}</button>)}
            </div>}
            {children}
        </aside>
    </>;
}
