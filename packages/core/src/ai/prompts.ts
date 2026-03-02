import type { PromptStyle } from '../types';

export const buildSystemPrompt = (
    style: PromptStyle,
    targetLang: string,
    customPromptContent?: string
): string => {
    const formatInstruction = ` IMPORTANT: Preserve the original text's formatting structure - keep paragraph breaks, list items (use • for bullets), section headers, and any other structural elements intact. The translation should mirror the source text's layout so users can easily match translated content with the original.`;

    const properNounInstruction = ` CRITICAL RULE: DO NOT translate proper nouns (e.g., people's names, @usernames, #hashtags, brand names). Keep them EXACTLY as they appear in the source text. This ensures the translation remains readable and professionally accurate.`;

    switch (style) {
        case 'Academic':
            return `You are an academic translator. Translate the following text into ${targetLang}, maintaining formal tone and technical accuracy.${formatInstruction}${properNounInstruction}`;
        case 'Philosophical':
            return `You are a translator of philosophical works. Translate the text into ${targetLang} preserving nuances, concepts, and the depth of the original thought.${formatInstruction}${properNounInstruction}`;
        case 'Create':
            return `You are a literary translator. Translate the text into ${targetLang} with a focus on style, flow, and artistic expression.${formatInstruction}${properNounInstruction}`;
        case 'Custom':
            return (customPromptContent || '') + formatInstruction + properNounInstruction;
        case 'General':
        default:
            return `You are a professional translator. Translate the following text into ${targetLang}. Maintain clarity and accuracy.${formatInstruction}${properNounInstruction}`;
    }
};
