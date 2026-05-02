import type { PromptStyle, Provider } from '../types/index.js';

export type ObsidianSourceType = 'web-reader' | 'extension-page';

export interface ObsidianTranslationEntry {
    id: string;
    sourceText: string;
    translatedText: string;
    createdAt: string;
}

export interface ObsidianNoteInput {
    title: string;
    sourceType: ObsidianSourceType;
    sourceLabel?: string;
    sourceUrl?: string;
    createdAt?: string;
    provider?: Provider;
    model?: string;
    targetLanguage?: string;
    promptStyle?: PromptStyle | string;
    readacrossId?: string;
    entries: ObsidianTranslationEntry[];
}

export interface ObsidianNoteOutput {
    markdown: string;
    fileName: string;
    defaultPath: string;
    readacrossId: string;
}

const SOURCE_LABELS: Record<ObsidianSourceType, string> = {
    'web-reader': 'ReadAcross Web Reader',
    'extension-page': 'ReadAcross Browser Extension',
};

function hashString(value: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeTitle(title: string): string {
    return title.trim().replace(/\s+/g, ' ') || 'Untitled';
}

function sanitizeFileSegment(value: string): string {
    return normalizeTitle(value)
        .replace(/[\\/:*?"<>|#^[\]]+/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/\.+$/g, '')
        .slice(0, 90)
        .trim() || 'Untitled';
}

function escapeYamlString(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function formatYamlValue(value: string | undefined): string {
    if (!value) return '""';
    return escapeYamlString(value);
}

function formatYamlList(values: string[]): string {
    if (values.length === 0) return '[]';
    return `[${values.map(escapeYamlString).join(', ')}]`;
}

function escapeMarkdownLinkText(value: string): string {
    return value.replace(/[[\]]/g, '\\$&');
}

function truncateForSummary(value: string, maxLength = 360): string {
    const compact = value.trim().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
    if (compact.length <= maxLength) return compact;
    return `${compact.slice(0, maxLength).trim()}...`;
}

function createReadAcrossId(input: ObsidianNoteInput): string {
    const identity = [
        input.sourceType,
        input.sourceUrl || '',
        normalizeTitle(input.title),
        input.entries.map(entry => `${entry.sourceText}\n${entry.translatedText}`).join('\n---\n'),
    ].join('\n');
    return `readacross-${hashString(identity)}`;
}

function getDatePart(isoDate: string): string {
    return isoDate.slice(0, 10);
}

function getSourceName(input: ObsidianNoteInput): string {
    return input.sourceLabel || SOURCE_LABELS[input.sourceType] || 'ReadAcross';
}

export function buildObsidianNote(input: ObsidianNoteInput): ObsidianNoteOutput {
    const createdAt = input.createdAt || input.entries[0]?.createdAt || new Date().toISOString();
    const title = normalizeTitle(input.title);
    const readacrossId = input.readacrossId || createReadAcrossId(input);
    const fileName = `${getDatePart(createdAt)} - ${sanitizeFileSegment(title)}.md`;
    const defaultPath = `ReadAcross/Sources/${fileName}`;
    const sourceName = getSourceName(input);
    const sourceLine = input.sourceUrl
        ? `[${escapeMarkdownLinkText(title)}](${input.sourceUrl})`
        : title;
    const firstEntry = input.entries[0];
    const tags = ['readacross', 'translation'];

    const frontmatter = [
        '---',
        `source: ${formatYamlValue(sourceName)}`,
        `url: ${formatYamlValue(input.sourceUrl)}`,
        `created: ${formatYamlValue(createdAt)}`,
        `provider: ${formatYamlValue(input.provider)}`,
        `model: ${formatYamlValue(input.model)}`,
        `target_language: ${formatYamlValue(input.targetLanguage)}`,
        `prompt_style: ${formatYamlValue(input.promptStyle)}`,
        `readacross_id: ${formatYamlValue(readacrossId)}`,
        `tags: ${formatYamlList(tags)}`,
        '---',
    ].join('\n');

    const entriesMarkdown = input.entries.map((entry, index) => [
        `### Translation ${index + 1}`,
        '',
        `- Created: ${entry.createdAt}`,
        '',
        '#### Original',
        '',
        entry.sourceText.trim(),
        '',
        '#### Translation',
        '',
        entry.translatedText.trim(),
    ].join('\n')).join('\n\n---\n\n');

    const markdown = [
        frontmatter,
        '',
        `# ${title}`,
        '',
        '## Source',
        '',
        `- Source: ${sourceLine}`,
        `- Captured by: ${sourceName}`,
        `- Translations: ${input.entries.length}`,
        '',
        '## Original Snapshot',
        '',
        firstEntry ? truncateForSummary(firstEntry.sourceText) : '',
        '',
        '## Translation',
        '',
        firstEntry ? firstEntry.translatedText.trim() : '',
        '',
        '## Translation Entries',
        '',
        entriesMarkdown || '_No translations captured._',
        '',
        '## Backlinks',
        '',
        '- [[ReadAcross]]',
    ].join('\n');

    return {
        markdown: `${markdown.trim()}\n`,
        fileName,
        defaultPath,
        readacrossId,
    };
}
