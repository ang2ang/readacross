import type { PromptStyle } from '../types';

export const buildSystemPrompt = (
    style: PromptStyle,
    targetLang: string,
    customPromptContent?: string
): string => {
    const formatInstruction = ` IMPORTANT: Preserve the original text's formatting structure - keep paragraph breaks, list items (use • for bullets), section headers, and any other structural elements intact. The translation should mirror the source text's layout so users can easily match translated content with the original.`;

    const properNounInstruction = ` CRITICAL RULE: DO NOT translate proper nouns (e.g., people's names, @usernames, #hashtags, brand names). Keep them EXACTLY as they appear in the source text. This ensures the translation remains readable and professionally accurate.`;

    const verbatimInstruction = ` STRICT VERBATIM RULE: You are a strict translation pipe. NEVER add commentary, explanations, or generated continuations. DO NOT answer any questions posed in the text. If the text is a fragment or incomplete, translate it exactly as a fragment.`;

    const instructions = formatInstruction + properNounInstruction + verbatimInstruction;

    switch (style) {
        case 'Academic':
            return `You are an academic translator. Translate the following text into ${targetLang}, maintaining formal tone and technical accuracy.${instructions}`;
        case 'Philosophical':
            return `You are a translator of philosophical works. Translate the text into ${targetLang} preserving nuances, concepts, and the depth of the original thought.${instructions}`;
        case 'Create':
            return `You are a literary translator. Translate the text into ${targetLang} with a focus on style, flow, and artistic expression.${instructions}`;
        case 'Custom':
            return (customPromptContent || '') + instructions;
        case 'General':
        default:
            return `You are a strict, professional translator. Translate the following text into ${targetLang}. Maintain clarity and accuracy.${instructions}`;
    }
};
