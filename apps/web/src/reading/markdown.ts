import { compareRecords } from './policy';
import { locationLabel } from './types';
import type { TranslationRecord } from './types';

const inline = (value: string) => value.replace(/[\r\n]+/g, ' ').replace(/([\\`*_{}[\]<>|])/g, '\\$1');
const configurationKey = ({ settings }: TranslationRecord) => JSON.stringify([
    settings.provider, settings.model, settings.targetLanguage, settings.promptStyle,
    settings.temperature, settings.systemPrompt, settings.endpointHash,
]);

function rangeLabel(record: TranslationRecord, index: number) {
    const location = locationLabel(record.locator) || `Part ${index + 1}`;
    const scope = record.scope === 'selection' ? 'Selection' : record.locator?.type === 'epub' ? 'Current view' : record.locator?.type === 'pdf' ? 'Whole page' : '';
    return [location, scope].filter(Boolean).join(' · ');
}

export function buildReadingMarkdown(title: string, sourceLabel: string, entries: TranslationRecord[], documentId?: string) {
    const records = entries.filter(record => record.translation.trim()
        && (!documentId || !record.documentId || record.documentId === documentId)).sort(compareRecords);
    if (!records.length) throw new Error('No completed translations to export.');
    const source = title.replace(/[\r\n]+/g, ' ').trim() || 'ReadAcross Translation';
    const name = source.replace(/\.(pdf|epub)$/i, '').trim() || 'ReadAcross Translation';
    const fileName = `${name.replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/\.+$/g, '').slice(0, 120).trim() || 'ReadAcross'}.translated.md`;
    const configurations = [...new Set(records.map(configurationKey))];
    const labels = records.map(rangeLabel);
    const body = records.map((record, index) => [
        `## ${inline(labels[index])}`,
        // Preserve Markdown indentation, hard line breaks, lists, tables and code.
        record.translation.replace(/^(?:\r?\n)+|(?:\r?\n)+$/g, ''),
    ].join('\n\n')).join('\n\n');
    const details = records.map((record, index) => {
        const { settings, locator } = record;
        const values = [inline(record.createdAt), inline(settings.targetLanguage), inline(settings.promptStyle),
            `${inline(settings.provider)} / ${inline(settings.model)}`, `Temperature ${settings.temperature}`,
            configurations.length > 1 ? `Configuration ${configurations.indexOf(configurationKey(record)) + 1}` : ''];
        const range = locator?.type === 'epub' ? `\n   CFI: ${inline(locator.cfi)}${locator.endCfi ? ` → ${inline(locator.endCfi)}` : ''}` : '';
        return `${index + 1}. **${inline(labels[index])}** — ${values.filter(Boolean).join(' · ')}${range}`;
    }).join('\n');
    const markdown = [
        `# ${inline(name)}`,
        `> Source: ${inline(source)} · ${inline(sourceLabel)}\n> ${records.length} completed translation${records.length === 1 ? '' : 's'}. Untranslated content is not included.`,
        body,
        '---',
        '## Translation details',
        configurations.length > 1 ? 'Multiple generation configurations were used, including any prompt variants.' : '',
        details,
    ].filter(Boolean).join('\n\n');
    return { markdown: `${markdown}\n`, fileName };
}
