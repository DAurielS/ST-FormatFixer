import { SlashCommandParser } from "../../../slash-commands/SlashCommandParser.js";
import { SlashCommand } from "../../../slash-commands/SlashCommand.js";
import { extension_settings } from "../../../extensions.js";

// Extension name
const extensionName = "format-fixer";
const formatFixerDefaults = {
    processQuotes: false,
};

// Test cases
const TEST_CASES = {
    basic: {
        name: "Basic Quote and Narrative",
        input: '*"Hello,"* she said *"I\'m happy to meet you."*',
        expected: '"Hello," *she said* "I\'m happy to meet you."'
    },
    nested: {
        name: "Nested Emphasis",
        input: '*The cat was *very* cute* "He was *quite* happy"',
        expected: '*The cat was **very** cute* "He was **quite** happy"'
    },
    complex: {
        name: "Complex Mixed Formatting",
        input: '*"Where did they go?"* The cat wondered, watching the *mysterious* figure disappear into the *dark and *spooky* night.*',
        expected: '"Where did they go?" *The cat wondered, watching the **mysterious** figure disappear into the dark and **spooky** night.*'
    },
    narrative_quote: {
        name: "Quote Within Narrative",
        input: '*The man needed no "help" to fetch his gun*',
        expected: '*The man needed no "help" to fetch his gun*'
    },
    spacing_issues: {
        name: "Spacing Issues",
        input: "I  've got     way too many    spaces   - in my text  .",
        expected: "*I've got way too many spaces - in my text.*"
    },
    cyoa: {
        name: "CYOA Options",
        input: '*The ancient tome presents you with several choices:*\n\n1. Open the mysterious door\n2> Investigate the strange sounds\nA) Talk to the old man\nB. Run away as fast as possible',
        expected: '*The ancient tome presents you with several choices:*\n\n1. Open the mysterious door\n2> Investigate the strange sounds\nA) Talk to the old man\nB. Run away as fast as possible'
    },
    height_measurement: {
        name: "Height Measurement Protection",
        input: '*She was 5\'10" tall and wore a "beautiful" dress*',
        expected: '*She was 5\'10" tall and wore a "beautiful" dress*'
    },
    single_word_emphasis: {
        name: "Single Word Emphasis at Line Start",
        input: '**Bold.**\n**Bold** text here\n**Another** bold word\nSome **inline** bold',
        expected: '***Bold.***\n***Bold** text here*\n***Another** bold word*\n*Some **inline** bold*'
    },
    custom: {
        name: "Custom Input",
        input: "",
        expected: ""
    }
};

class TextProcessor {
    constructor() {
        this.debugLog = [];
        this.protectedBlockPlaceholderPrefix = "__PROTECTED_BLOCK_PLACEHOLDER_"; // Generic prefix
        this.protectedBlockPlaceholderSuffix = "__";
    }

    /**
     * Extracts protected blocks (<think>, Message # tags) and replaces them with unique placeholders.
     * Handles both closed <think>...</think> and unclosed <think>...EOF.
     * Handles Message Number tags at the start of lines.
     * @param {string} text The input text.
     * @returns {{text: string, protectedBlocks: Map<string, string>}} Object with text containing placeholders and a map of placeholders to original content.
     */
    extractProtectedBlocks(text) {
        const protectedBlocks = new Map();
        let processedText = text;
        let index = 0;
        const generatePlaceholder = () => `${this.protectedBlockPlaceholderPrefix}${index++}${this.protectedBlockPlaceholderSuffix}`;

        // 1. Extract <think>...</think> blocks
        const closedThinkRegex = /<think>(.*?)<\/think>/gs;
        processedText = processedText.replace(closedThinkRegex, (match) => {
            const placeholder = generatePlaceholder();
            protectedBlocks.set(placeholder, match); // Store the full tag and content
            return placeholder;
        });

        // Check for unclosed <think> tag at the end of the text
        // This regex matches <think> followed by any characters until the end of the string
        // 2. Extract unclosed <think>...EOF blocks
        const unclosedThinkMatch = processedText.match(/<think>(.*)$/s);
        if (unclosedThinkMatch) {
            const fullMatch = unclosedThinkMatch[0];
            const placeholder = generatePlaceholder();
            protectedBlocks.set(placeholder, fullMatch); // Store the tag and content to EOF
            // Replace the unclosed tag and everything after it with the placeholder
            processedText = processedText.replace(/<think>(.*)$/s, placeholder);
        }

        // 3. Extract "Message #X: " tags at the start of lines
        const messageNumRegex = /^(.*? Message #\d+: )/gm; // Use multiline flag
        processedText = processedText.replace(messageNumRegex, (match, group1) => {
            // group1 contains the matched tag, e.g., "User Message #1: "
            const placeholder = generatePlaceholder();
            protectedBlocks.set(placeholder, group1); // Store the matched tag
            return placeholder; // Replace the tag with the placeholder
        });

        // 4. Extract square bracket blocks [...]
        // Matches [content] including newlines, non-greedy
        processedText = processedText.replace(/\[(.*?)\]/gs, (match) => {
            const placeholder = generatePlaceholder();
            protectedBlocks.set(placeholder, match);
            return placeholder;
        });

        // 5. Extract unclosed square bracket blocks [...EOF
        const unclosedSquareBracketMatch = processedText.match(/\[(.*)$/s);
        if (unclosedSquareBracketMatch) {
            const fullMatch = unclosedSquareBracketMatch[0];
            const placeholder = generatePlaceholder();
            protectedBlocks.set(placeholder, fullMatch);
            processedText = processedText.replace(/\[(.*)$/s, placeholder);
        }

        return { text: processedText, protectedBlocks };
    }

    /**
     * Restores original protected blocks by replacing placeholders.
     * @param {string} text The text containing placeholders.
     * @param {Map<string, string>} protectedBlocks Map of placeholders to original content.
     * @returns {string} The text with original blocks restored.
     */
    restoreProtectedBlocks(text, protectedBlocks) {
        let result = text;
        // Replace placeholders with original content
        // Iterate in reverse order of keys (indices) might be safer if placeholders could somehow nest, though unlikely here.
        // However, simple iteration should be fine given the generation method.
        for (const [placeholder, originalContent] of protectedBlocks.entries()) {
            // Use a regex with global flag to replace all occurrences
            // Escape placeholder string for use in regex
            const escapedPlaceholder = placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const placeholderRegex = new RegExp(escapedPlaceholder, 'g');
            result = result.replace(placeholderRegex, originalContent);
        }
        return result;
    }

    /**
     * Protect height measurements from quote processing
     * Handles patterns like 5'10", 6'2", etc.
     * @param {string} text The input text
     * @returns {{text: string, heightMeasurements: Map<string, string>}} Object with text containing placeholders and a map of placeholders to original measurements
     */
    protectHeightMeasurements(text) {
        const heightMeasurements = new Map();
        let processedText = text;
        let index = 0;
        const generatePlaceholder = () => `__HEIGHT_MEASUREMENT_${index++}__`;

        // Match height measurements: digit(s) + ' + digit(s) + "
        // Examples: 5'10", 6'2", 10'11"
        const heightRegex = /\d+'\d{1,2}"/g;
        
        processedText = processedText.replace(heightRegex, (match) => {
            const placeholder = generatePlaceholder();
            heightMeasurements.set(placeholder, match);
            return placeholder;
        });

        return { text: processedText, heightMeasurements };
    }

    /**
     * Restore height measurements by replacing placeholders
     * @param {string} text The text containing placeholders
     * @param {Map<string, string>} heightMeasurements Map of placeholders to original measurements
     * @returns {string} The text with original height measurements restored
     */
    restoreHeightMeasurements(text, heightMeasurements) {
        let result = text;
        for (const [placeholder, originalMeasurement] of heightMeasurements.entries()) {
            const escapedPlaceholder = placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const placeholderRegex = new RegExp(escapedPlaceholder, 'g');
            result = result.replace(placeholderRegex, originalMeasurement);
        }
        return result;
    }

    /**
     * Fix single bold words at the start of lines by converting them to bold-italic
     * and wrapping the rest of the line in italics if needed
     * @param {string} text The input text
     * @returns {string} The text with fixed single word emphasis
     */
    fixSingleWordEmphasisAtLineStart(text) {
        const lines = text.split('\n');
        const processedLines = lines.map(line => {
            // Skip lines that already start with single asterisk (already italicized)
            if (line.trim().startsWith('*') && !line.trim().startsWith('**')) {
                return line;
            }
            
            // Match **word** (possibly with punctuation) at the start of a line
            const match = line.match(/^(\s*)\*\*([^*]+?)\*\*(.*)$/);
            if (!match) {
                return line;
            }
            
            const [, leadingSpace, boldContent, restOfLine] = match;
            
            // If there's content after the bold word, only triple the leading asterisks.
            if (restOfLine.trim().length > 0) {
                return `${leadingSpace}***${boldContent}**${restOfLine}`;
            } else {
                // If it's just the bold word (possibly with punctuation), make it bold-italic
                return `${leadingSpace}***${boldContent}***`;
            }
        });
        
        return processedLines.join('\n');
    }

    processText(text) {
        try {
            const context = SillyTavern.getContext();
            const settings = loadSettings();

            if (context.characters[context.characterId].tags.includes("Assistant")) {
                // If the character is an Assistant, skip processing
                return text;
            }
            // Applies to all text, even protected blocks
            let result = this.uncensorText(text);

            // Pre-processing: Handle protected blocks
            const { text: textWithPlaceholders, protectedBlocks } = this.extractProtectedBlocks(result);
            result = textWithPlaceholders;

            // Stage 0: Normalize all "smart" characters to regular characters
            result = this.normalizeSmartCharacters(result);

            // Stage 0.5: Protect height measurements before quote processing
            const { text: textWithHeightPlaceholders, heightMeasurements } = this.protectHeightMeasurements(result);
            result = textWithHeightPlaceholders;

            // Stage 1: Process quotes
            if (settings.processQuotes) {
                result = this.processQuotes(result);
            }

            // Stage 1.5: Cleanup consecutive double quotes
            result = this.cleanupConsecutiveQuotes(result);

            // Stage 2: Convert single-word italics to bold
            result = this.processNestedEmphasis(result);

            // Stage 3: Clean up any quadruple asterisks
            result = this.cleanupQuadrupleAsterisks(result);

            // Stage 4: Clean up unpaired double asterisks within text
            result = this.cleanupUnpairedDoubleAsterisks(result);

            // Stage 4.1: Clean up lone asterisks in quotes
            result = this.cleanupLoneAsterisks(result);

            // Stage 4.2: Clean up spaces between asterisks and text
            result = this.cleanupAsteriskSpacing(result);

            // Stage 4.3: Clean up spaces between quotes and text
            result = this.cleanupQuoteSpacing(result);

            // Stage 5: Process narrative sections
            result = this.processNarrative(result);

            // Stage 6: Clean up any excessive newlines
            result = this.cleanupExcessNewlines(result);

            // Stage 6.5: Clean up excessive spaces
            result = this.cleanupExcessSpaces(result);

            // Stage 7: Merge nested emphasis
            result = this.mergeNestedEmphasis(result);

            // Stage 7.5: Fix single bold words at line start
            result = this.fixSingleWordEmphasisAtLineStart(result);

            // Post-processing: Restore height measurements after quote processing
            result = this.restoreHeightMeasurements(result, heightMeasurements);

            // Post-processing: Restore protected blocks - MUST be the last step
            result = this.restoreProtectedBlocks(result, protectedBlocks);

            return result;
        } catch (error) {
            console.error('Format Fixer error:', error);
            return text;
        }
    }

    /**
     * Uncensors text by replacing censored versions with original words.
     * This version handles any number of underscores between the required characters.
     * @param {string} text The input text potentially containing censored words.
     * @returns {string} The uncensored text.
     */
    uncensorText(text) {
        // Define regex patterns with variable underscore counts using _+
        const uncensorRules = [
            // Handle longer patterns first to avoid partial matches
            { pattern: /p_+nis|p_+is/gi, word: 'penis' },
            { pattern: /v_+gina|v_+ina/gi, word: 'vagina' },
            { pattern: /p_+s+y|p_+y/gi, word: 'pussy' },
            { pattern: /f_+c*k/gi, word: 'fuck' },
            { pattern: /c_+n*t/gi, word: 'cunt' },
            { pattern: /a_+s*hole/gi, word: 'asshole' },
            { pattern: /c_+c*k/gi, word: 'cock' },
            { pattern: /d_+c*k/gi, word: 'dick' },
            { pattern: /s_+x/gi, word: 'sex' },
            { pattern: /c_+me/gi, word: 'came' },
            { pattern: /c_+m/gi, word: 'cum' },
            { pattern: /n_+p+le|n_+le/gi, word: 'nipple' },
            { pattern: /p_+s+/gi, word: 'piss' },
            { pattern: /ur_+ne/gi, word: 'urine' },
            { pattern: /an_+s/gi, word: 'anus' },
            { pattern: /an_+l/gi, word: 'anal' },
            { pattern: /r_+c*tum/gi, word: 'rectum' },
            { pattern: /f_+g/gi, word: 'fag' },
            { pattern: /t_+t(?:s|ies|y)?/gi, word: (match) => {
                // Special handler for t_t variations
                const suffix = match.slice(-1);
                if (suffix === 's') return 'tits';
                if (match.endsWith('ies')) return 'titties';
                if (suffix === 'y') return 'titty';
                return 'tit';
            }},
            { pattern: /n_+k(?:ed|dity)|n_+de/gi, word: (match) => {
                // Special handler for naked/nude variations
                if (match.includes('k')) return match.includes('dity') ? 'nudity' : 'naked';
                return 'nude';
            }},
            { pattern: /t_+(?:s)?icle/gi, word: 'testicle' },
            { pattern: /t_+(?:s)?cle/gi, word: 'testicle' },
            { pattern: /t_+(?:s)?es/gi, word: 'testes' },
            { pattern: /p_+(?:r)?n/gi, word: 'porn' },
            { pattern: /sh_+t/gi, word: 'shit' },
            { pattern: /sl_+t/gi, word: 'slut' },
            { pattern: /b_+t?ch/gi, word: 'bitch' },
            { pattern: /b_+n?er/gi, word: 'boner' },
            { pattern: /p_+b(?:is|ic|es)/gi, word: (match) => {
                // Special handler for pubis variations
                if (match.endsWith('is')) return 'pubis';
                if (match.endsWith('ic')) return 'pubic';
                return 'pubes';
            }},
            { pattern: /s_+d/gi, word: 'seed' },
            { pattern: /s_+men/gi, word: 'semen' },
            { pattern: /er_+tic/gi, word: 'erotic' },
            { pattern: /j_+rk(?:ing|ed)/gi, word: (match) => {
                if (match.endsWith('ing')) return 'jerking';
                return 'jerked';
            }},
            { pattern: /h_+rny/gi, word: 'horny' },
            { pattern: /b_+o*b/gi, word: 'boob' },
            { pattern: /a_+s*s/gi, word: 'ass' },
            { pattern: /b_+ll/gi, word: 'ball' },
            { pattern: /wh_+ore/gi, word: 'whore' },
            { pattern: /w_+ore/gi, word: 'whore' },
            { pattern: /h_+le/gi, word: 'hole' }
        ];

        let result = text;

        // Apply each uncensor rule
        for (const rule of uncensorRules) {
            result = result.replace(rule.pattern, (match) => {
                const originalWord = typeof rule.word === 'function' ? rule.word(match) : rule.word;

                // Preserve original capitalization
                // Case 1: ALL CAPS (e.g., "F__K" -> "FUCK")
                if (match === match.toUpperCase()) {
                    return originalWord.toUpperCase();
                }
                // Case 2: Capitalized (e.g., "P___nis" -> "Penis")
                if (match[0] === match[0].toUpperCase()) {
                    return originalWord.charAt(0).toUpperCase() + originalWord.slice(1);
                }
                // Case 3: all lowercase (e.g., "c___m" -> "cum")
                return originalWord;
            });
        }

        return result;
    }

    /**
     * Stage 0: Normalize smart characters
     * Converts various smart typography characters to their basic ASCII equivalents
     */
    normalizeSmartCharacters(text) {
        return text
            // Double quotes (including fullwidth and ornamental variants)
            .replace(/[\u00AB\u00BB\u201C\u201D\u02BA\u02EE\u201F\u275D\u275E\u301D\u301E\uFF02]/g, '"')
            
            // Single quotes and apostrophes (Not including backticks/graves)
            .replace(/[\u2018\u2019\u02BB\u02C8\u02BC\u02BD\u02B9\u201B\uFF07\u02CA\u275B\u275C\u0313\u0314]/g, "'")
            
            // Dashes and hyphens (preserving em dash)
            .replace(/[\u2010\u2043\u23BC\u23BD\uFE63\uFF0D]/g, '-')
            .replace(/\u2013/g, '-')  // en dash to hyphen
            .replace(/\u2015/g, '\u2014')  // horizontal bar to em dash
            
            // Ellipsis
            .replace(/\u2026/g, '...')
            
            // Various spaces
            .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g, ' ')
            
            // Bullets and decorative characters
            .replace(/[\u2022\u2043\u2219\u25D8\u25E6\u2619\u2765\u2767]/g, '*')
            
            // Swung dash
            .replace(/\u2053/g, '~');
    }
    
    /**
     * Stage 1: Process quotes
     * Only removes asterisks that directly wrap quotes
     */
    processQuotes(text) {
        let result = text;
        
        // Handle quotes with emphasis at start or end or both
        result = result
            // Remove emphasis wrapping entire quotes
            .replace(/\*([""][^""]*[""])\*/g, '$1')
            // Remove emphasis at start of quotes
            .replace(/\*([""][^""]*[""]) *(?!\*)/g, '$1')
            // Remove emphasis at end of quotes
            .replace(/(?<!\*) *([""][^""]*[""])\*/g, '$1');
        
        return result;
    }

    /**
     * Stage 1.5: Handles consecutive double quotes by removing the redundant ones
     * Converts patterns like ""text"" to "text"
     */
    cleanupConsecutiveQuotes(text) {
        let result = text;
        
        result = result
            // Removes double quotes wrapping entire quotes
            .replace(/"{2,}([^"]+)"{2,}/g, '"$1"')
            // Removes double quotes at start of quotes
            .replace(/"{2,}([^"]+)" *(?!\*)/g, '"$1"')
            // Removes double quotes at end of quotes
            .replace(/(?<!\*) *([^"]+)"{2,}/g, '$1"');

        return result;
    }

    /**
     * Stage 2: Process nested emphasis
     * Converts single-word italics to bold
     */
    processNestedEmphasis(text) {
        // Convert single-word italics to bold
        // Only match actual words (letters, numbers, and allowed punctuation)
        return text.replace(/(?<!\*)\*([\w'-]+[?!./,:\\]?)\*(?!\*)/g, '**$1**');
    }

    /**
     * Stage 3: Clean up quadruple asterisks
     * Replaces any sequence of 4 or more asterisks with 3 asterisks
     */
    cleanupQuadrupleAsterisks(text) {
        return text.replace(/\*{4,}/g, '***');
    }

    /**
     * Stage 4: Clean up unpaired double asterisks within text
     * Uses string traversal to find and remove orphaned ** markers
     * while preserving properly matched pairs.
     * Called after cleanupLoneAsterisks to handle cases within dialogue.
     * Also called as a helper method within processNarrative.
     */
    cleanupUnpairedDoubleAsterisks(text) {
        let result = text;
        let allMatches = [];

        // First find complete pairs (only matching word content)
        const completePairs = result.match(/\*\*([\w'-]+[?!./,:\\]?)\*\*/g);
        if (completePairs) {
            allMatches = allMatches.concat(completePairs);
            // Remove complete pairs from working text
            result = result.replace(/\*\*([\w'-]+[?!./,:\\]?)\*\*/g, '');
        }

        // Then find unpaired double asterisks in the remaining text
        const startAsterisks = result.match(/\*\*([\w'"-]+[?!./,:\\]?)/g);
        const endAsterisks = result.match(/([\w'"-]+[?!./,:\\]?)\*\*/g);
        
        if (startAsterisks) allMatches = allMatches.concat(startAsterisks);
        if (endAsterisks) allMatches = allMatches.concat(endAsterisks);

        if (!allMatches.length) return text;
        result = text;  // Reset result to original text for final processing

        // Process each match
        allMatches.forEach(match => {
            let cleaned = '';
            let i = 0;
            
            while (i < match.length) {
                if (i + 1 < match.length && match[i] === '*' && match[i + 1] === '*') {
                    // Look ahead for matching pair
                    let found = false;
                    let searchPos = i + 2;
                    let matchEnd = -1;
                    
                    while (searchPos < match.length - 1) {
                        if (match[searchPos] === '*' && match[searchPos + 1] === '*') {
                            const between = match.substring(i + 2, searchPos).trim();
                            if (between.length > 0 && !between.includes('**')) {
                                found = true;
                                matchEnd = searchPos + 2;
                            }
                            break;
                        }
                        searchPos++;
                    }
                    
                    if (found) {
                        // Keep complete pairs
                        cleaned += match.substring(i, matchEnd);
                        i = matchEnd;
                    } else {
                        // Skip unpaired double asterisk
                        i += 2;
                    }
                    continue;
                }
                
                cleaned += match[i];
                i++;
            }

            if (match !== cleaned) {
                result = result.replace(match, cleaned);
            }
        });
        
        return result;
    }

    /**
     * Stage 4.1: Clean up lone asterisks within quotes
     * Only removes asterisks that appear to be broken formatting
     * Handles cases with punctuation like ellipsis, periods, etc.
     */
    cleanupLoneAsterisks(text) {
        // Specifically target asterisks within quotes that:
        // 1. Have a word character, punctuation, or space on one side only
        // 2. Don't appear to be part of a bold pattern
        return text.replace(/"[^"]*"/g, match =>
            // First handle the asterisk cleanup
            match.replace(/(?:\b|\s|[.,!?:])\*(?!\*)|(?<!\*)\*(?:\b|\s|[.,!?:])/g, match => 
                match.replace('*', '')
            )
            // Then normalize multiple spaces to single spaces
            .replace(/\s{2,}/g, ' ')
        );
    }

    /**
     * Stage 4.2: Clean up spaces between asterisks and text
     * Fixes cases where there are unnecessary spaces between emphasis markers and text
     * Example: "* text *" becomes "*text*"
     */
    cleanupAsteriskSpacing(text) {
        return text.replace(/(?<![\S])\*\s*([^*]+?)\s*\*(?![\S])/g, (match, content) => {
            // Preserve any spaces before/after the section while cleaning internal spaces
            const hasSpaceBefore = match.startsWith(' ');
            const hasSpaceAfter = match.endsWith(' ');
            return (hasSpaceBefore ? ' ' : '') + '*' + content.trim() + '*' + (hasSpaceAfter ? ' ' : '');
        });
    }

    /**
     * Stage 4.3: Clean up spaces between quotation marks and text
     * Fixes cases where there are unnecessary spaces between quotes and text
     * Example: '" text "' becomes '"text"'
     */
    cleanupQuoteSpacing(text) {
        return text.replace(/(?<![\S])"\s*([^"]+?)\s*"(?![\S])/g, (match, content) => {
            // Preserve any spaces before/after the section while cleaning internal spaces
            const hasSpaceBefore = match.startsWith(' ');
            const hasSpaceAfter = match.endsWith(' ');
            return (hasSpaceBefore ? ' ' : '') + '"' + content.trim() + '"' + (hasSpaceAfter ? ' ' : '');
        });
    }

    /**
     * Stage 5: Process narrative sections
     * Adds italics to narrative text between quotes
     */
    processNarrative(text) {
        const sections = this.splitBetweenQuotes(text);
        let result = '';
        
        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            
            // Prevent double spaces when joining sections
            if (result && section.raw && result.endsWith(' ') && section.raw.startsWith(' ')) {
                // Remove one of the spaces
                result = result.slice(0, -1);
            }
            
            if (section.type === 'newline') {
                // Preserve paragraph breaks
                result += section.raw;
            }
            else if (section.type === 'quote' || section.type === 'code') {
                // Add quotes as-is with original spacing
                result += section.raw;
            }
            else {
                // Handle narrative sections
                if (!this.isItalicized(section.text)) {
                    // When adding start asterisk, also add space if needed
                    if (!section.text.startsWith('*')) {
                        if (result && !result.endsWith(' ') && !result.endsWith('\n')) result += ' ';
                        result += '*';
                    }
                    
                    result += section.text;
                    
                    // When adding end asterisk, also add space if needed
                    if (!section.text.endsWith('*')) {
                        result += '*';
                        if (i < sections.length - 1 && !section.text.endsWith(' ') && sections[i + 1].type !== 'newline') result += ' ';
                    }
                } else {
                    // Already properly emphasized - preserve original spacing
                    result += section.raw;
                }
            }
        }
        
        return result.trim();
    }
    
    /**
     * Stage 6: Clean up excessive newlines
     * Replaces any sequence of 3+ newlines with exactly 2
     */
    cleanupExcessNewlines(text) {
        return text.replace(/\n{3,}/g, '\n\n');
    }

    /**
     * Stage 6.5: Clean up excessive spaces
     * Replaces any sequence of 2+ spaces with 1
     * Also removes unnecessary spaces between words and punctuation marks
     */
    cleanupExcessSpaces(text) {
        return text.replace(/ {2,}/g, ' ')
                   .replace(/ \.\.\. /g, '...')
                   .replace(/ ([.,!?;:—])/g, '$1');
    }

    /**
     * Stage 7: Merge nested emphasis
     * Processes text in sections bounded by quotes and newlines,
     * cleaning up sections that have erroneous asterisks.
     * Key features:
     * - Stops at quote and newline boundaries
     * - Preserves bold (**) formatting
     * - Merges sections with more than 2 single asterisks
     * - Maintains proper spacing
     */
    mergeNestedEmphasis(text) {
        let result = '';
        let sectionStart = -1;  // Start of current section being analyzed
        let asteriskCount = 0;  // Count of single asterisks in current section
        let buffer = '';
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            
            // Check for section boundaries
            if (char === '"' || char === '\n') {
                // Hit a natural boundary, add everything up to here and reset
                if (sectionStart !== -1) {
                    result += buffer;
                    sectionStart = -1;
                }
                result += char;
                asteriskCount = 0;
                buffer = '';
                continue;
            }
            
            // Handle bold markers
            if (char === '*' && text[i + 1] === '*') {
                if (sectionStart === -1) {
                    result += '**';  // Not in a section, just add bold marker
                } else {
                    buffer += '**';  // In a section, add to buffer
                }
                i++;  // Skip next asterisk
                continue;
            }
            
            // Handle single asterisks
            if (char === '*') {
                if (sectionStart === -1) {
                    // Start new section
                    sectionStart = i;
                    asteriskCount = 1;
                    buffer = '*';
                } else {
                    // In a section
                    asteriskCount++;
                    if (asteriskCount === 3) {
                        // Found an erroneous asterisk, clean up the section
                        // First preserve bold sections by temporarily marking them
                        let cleaned = buffer.replace(/\*\*([^*]+)\*\*/g, '@@$1@@');
                        // Then clean up single asterisks
                        cleaned = '*' + cleaned.slice(1).replace(/\*/g, '');
                        // Finally restore bold sections
                        buffer = cleaned.replace(/@@([^@]+)@@/g, '**$1**');
                    } else {
                        buffer += char;
                    }
                }
            } else {
                if (sectionStart === -1) {
                    result += char;
                } else {
                    buffer += char;
                }
            }
        }
        
        // Add any remaining buffer
        if (sectionStart !== -1) {
            if (asteriskCount >= 3) {
                buffer = '*' + buffer.slice(1) + '*';
            }
            result += buffer;
        }
        
        return result;
    }
    
    // Helper Functions

    /**
     * Check if text is a quoted section
     */
    isQuote(text) {
        return /^[""][^""]*[""]$/.test(text);
    }

    /**
     * Check if text is already italicized
     */
    isItalicized(text) {
        return /^\*[^*]+\*$/.test(text);
    }

    /**
     * Helper method to check if a position in text is within a proper emphasis section
     * Looks ahead and behind for matching asterisks, considering quote boundaries
     */
    isWithinEmphasis(text, position) {
        // First find paragraph bounds
        let paragraphStart = position;
        while (paragraphStart > 0 && text[paragraphStart - 1] !== '\n') {
            paragraphStart--;
        }
        
        let paragraphEnd = text.indexOf('\n', position);
        if (paragraphEnd === -1) paragraphEnd = text.length;

        // Look for relevant opening asterisk, skipping complete pairs
        let openPos = -1;
        let i = paragraphStart;
        while (i < position) {
            if (text[i] === '*') {
                if (text[i + 1] === '*') {
                    i += 2;  // Skip bold markers
                    continue;
                }
                
                // Skip if asterisk has whitespace after it
                if (text[i + 1] === ' ' || text[i + 1] === '\t') {
                    i++;
                    continue;
                }

                // Look for matching closer before our position
                let hasMatch = false;
                for (let j = i + 1; j < position; j++) {
                    if (text[j] === '*' && text[j-1] !== '*' && text[j+1] !== '*') {
                        hasMatch = true;
                        i = j + 1;  // Skip to after this complete pair
                        break;
                    }
                }
                
                if (!hasMatch) {
                    // Found an unpaired opening asterisk
                    openPos = i;
                    break;
                }
            }
            i++;
        }
        
        if (openPos === -1) return false;  // No relevant opening asterisk found
        
        // Look for the first single asterisk after our position
        let closePos = -1;
        for (i = position + 1; i < paragraphEnd; i++) {
            // First check if it's a single asterisk (not part of bold)
            if (text[i] === '*' && text[i-1] !== '*' && text[i+1] !== '*') {
                // If this asterisk has whitespace before it, it can't be a closer
                // Return false immediately because any later asterisk would be after
                // an invalid closing marker
                if (text[i-1] === ' ' || text[i-1] === '\t') {
                    return false;
                }
                closePos = i;
                break;
            }
        }
        
        return closePos !== -1;  // True only if we found a valid closing asterisk
    }

    /**
     * Split text between standalone quotes while preserving quotes and original spacing
     */
    splitBetweenQuotes(text) {
        // Split on quotes and newlines
        let sections = [];
        let buffer = '';
        
        const pushBuffer = () => {
            if (buffer) {
                sections.push({
                    raw: buffer,
                    text: buffer.trim(),
                    type: 'narrative'
                });
                buffer = '';
            }
        };
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            // Check for protected block placeholders first
            const placeholderRegex = new RegExp(`${this.protectedBlockPlaceholderPrefix}\\d+${this.protectedBlockPlaceholderSuffix}`);
            const remainingText = text.substring(i);
            const placeholderMatch = remainingText.match(placeholderRegex);

            if (placeholderMatch && placeholderMatch.index === 0) {
                // Found a placeholder (either <think>, Message #, or square bracket)
                const placeholder = placeholderMatch[0];
                pushBuffer(); // Push any content before the placeholder
                sections.push({
                    raw: placeholder,
                    text: placeholder,
                    type: 'code' // Mark as code to be ignored by processNarrative
                });
                i += placeholder.length - 1; // Move index past the placeholder
                continue; // Continue to the next character after the placeholder
            }

            // Check for code blocks
            if (char === '`') {
                // Found potential code block
                let codeBuffer = char;

                // Check if it's a triple backtick
                let isTriple = false;
                if (i + 2 < text.length && text[i + 1] === '`' && text[i + 2] === '`') {
                    codeBuffer += '``';
                    isTriple = true;
                    i += 2;
                }

                // Capture everything until closing backticks
                i++;
                while (i < text.length) {
                    codeBuffer += text[i];
                    if (text[i] === '`') {
                        if (!isTriple) break;
                        if (i + 2 < text.length && text[i + 1] === '`' && text[i + 2] === '`') {
                            codeBuffer += '``';
                            i += 2;
                            break;
                        }
                    }
                    i++;
                }

                pushBuffer();  // Push any content before the code block
                sections.push({
                    raw: codeBuffer,
                    text: codeBuffer,
                    type: 'code'
                });
            }
            // Check for CYOA-style lines at line start
            else if ((buffer === '' || buffer.endsWith('\n')) &&
                    /^[a-zA-Z0-9]/.test(char) &&
                    i + 1 < text.length &&
                    /[.>)]/.test(text[i + 1])) {
                // Found a CYOA-style line
                pushBuffer();  // Push any content before

                let cyoaBuffer = char + text[i + 1];  // Add the number/letter and delimiter
                i++;  // Move past delimiter

                // Capture the rest of the line
                i++;
                while (i < text.length && text[i] !== '\n') {
                    cyoaBuffer += text[i];
                    i++;
                }
                if (i < text.length) {
                    cyoaBuffer += text[i];  // Include the newline
                }

                sections.push({
                    raw: cyoaBuffer,
                    text: cyoaBuffer,
                    type: 'code'  // Use code type to exempt from processing
                });
            }

            else if (char === '*') {
                buffer += char;
            }

            else if (char === '"' && !this.isWithinEmphasis(text, i)) {
                pushBuffer();

                // Check for a single space before the quote
                let leadingSpace = (i > 0 && text[i - 1] === ' ') ? ' ' : '';

                // Add quote with optional leading space
                let quoteBuffer = leadingSpace + char;

                // Capture the quote content
                i++;
                while (i < text.length && text[i] !== '"') {
                    quoteBuffer += text[i];
                    i++;
                }
                if (i < text.length) quoteBuffer += text[i];

                // Check for a single trailing space
                if (i + 1 < text.length && text[i + 1] === ' ') {
                    quoteBuffer += ' ';
                    i++; // Move past the space
                }

                sections.push({
                    raw: quoteBuffer,
                    text: quoteBuffer.trim(),
                    type: 'quote'
                });
            }
            else if (char === '\n') {
                // End current section at newline
                buffer += char;
                pushBuffer();

                // Count consecutive newlines
                let newlineCount = 1;
                while (i + 1 < text.length && text[i + 1] === '\n') {
                    newlineCount++;
                    i++;
                }

                // Always create a newline section
                sections.push({
                    raw: newlineCount > 1 ? '\n\n' : '\n',  // Preserve single newlines, normalize multiples to double
                    text: '',
                    type: 'newline'
                });
            }
            else {
                buffer += char;
            }
        }

        pushBuffer();
        return sections.filter(s => s.text || s.type === 'newline');
    }
}

// Initialize processor
const processor = new TextProcessor();

// Settings management
function loadSettings() {
    const context = SillyTavern.getContext();
   
    // Create the settings if they don't exist or are empty
    if (!context.extensionSettings[extensionName] || Object.keys(context.extensionSettings[extensionName]).length === 0) {
        context.extensionSettings[extensionName] = { ...formatFixerDefaults };
    } else {
        // Ensure all default keys exist if settings were loaded but might be from an older version
        for (const key in formatFixerDefaults) {
            if (context.extensionSettings[extensionName][key] === undefined) {
                context.extensionSettings[extensionName][key] = formatFixerDefaults[key];
            }
        }
    }

    // Last ditch attempt to ensure settings exist
    if (context.extensionSettings[extensionName].processQuotes === undefined) {
        context.extensionSettings[extensionName].processQuotes = false;
    }
    
    context.saveSettingsDebounced();
    return context.extensionSettings[extensionName];
}

function onProcessQuotesToggleChange(event) {
    const context = SillyTavern.getContext();
    const settings = context.extensionSettings['format-fixer'];
    settings.processQuotes = $(event.target).prop('checked');
    context.saveSettingsDebounced();
}

// Format command function
function formatCommand(_, text) {
    if (!text) {
        return "Please provide text to format";
    }
    try {
        return processor.processText(text);
    } catch (error) {
        console.error('Format command error:', error);
        return `Error formatting text: ${error.message}`;
    }
}

// Register slash command with new parser
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'format',
    aliases: ['fmt'],
    description: 'Format text with proper emphasis and quotes',
    callback: formatCommand,
    returns: 'the formatted text with proper emphasis and quotes',
    helpString: `
        <div>
            <p>Formats text by fixing common formatting issues:</p>
            <ul>
                <li>Properly handles quotes and narrative sections</li>
                <li>Converts single-word italics to bold</li>
                <li>Fixes spacing around emphasis markers</li>
            </ul>
            <div>
                <strong>Examples:</strong>
                <pre><code>/format *"Hello,"* she said *"I'm happy to meet you."*</code></pre>
                <p>Returns: "Hello," *she said* "I'm happy to meet you."</p>
            </div>
        </div>
    `
}));

// Initialize extension
jQuery(async () => {
    try {
        // Load settings
        const settings = loadSettings();
        
        // Add settings panel
        const settingsHtml = `
            <div class="format-fixer-settings">
                <div class="inline-drawer">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b>Format Fixer</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content">
                        <div class="format_fixer_block">
                            <input title="When enabled, removes asterisks directly surrounding quotation marks.\nEnable if using a very low-power model that frequently places these incorrectly, otherwise leave disabled." type="checkbox" id="format_fixer_process_quotes" ${settings.processQuotes ? 'checked' : ''} />
                            <label for="format_fixer_process_quotes">Process Quotes</label>
                        </div>
                        
                        <div class="format_fixer_block">
                            <label for="format_fixer_test_case">Test Case:</label>
                            <select id="format_fixer_test_case">
                                <option value="basic">Basic Quote and Narrative</option>
                                <option value="nested">Nested Emphasis</option>
                                <option value="complex">Complex Mixed Formatting</option>
                                <option value="narrative_quote">Quote Within Narrative</option>
                                <option value="spacing_issues">Spacing Issues</option>
                                <option value="cyoa">CYOA Options</option>
                                <option value="height_measurement">Height Measurement Protection</option>
                                <option value="single_word_emphasis">Single Word Emphasis at Line Start</option>
                                <option value="custom">Custom Input</option>
                            </select>
                        </div>

                        <div class="format_fixer_block">
                            <label for="format_fixer_test_input">Input Text:</label>
                            <textarea id="format_fixer_test_input" class="text_pole textarea_compact" rows="3"></textarea>
                        </div>

                        <div class="format_fixer_block">
                            <label for="format_fixer_test_output">Test Results:</label>
                            <textarea id="format_fixer_test_output" class="text_pole textarea_compact" rows="3" readonly></textarea>
                        </div>

                        <div class="format_fixer_block">
                            <input id="format_fixer_test" class="menu_button" type="button" value="Run Test" />
                        </div>
                    </div>
                </div>
            </div>`;
        $('#extensions_settings2').append(settingsHtml);
        
        // Add format button to message input area
        const buttonHtml = '<button id="format_message" class="menu_button" title="Format message"><i class="fa-solid fa-wand-magic-sparkles"></i></button>';
        $("#send_but_sheld").prepend(buttonHtml);

        // Handle test case selection
        $("#format_fixer_test_case").on("change", (e) => {
            const testCase = TEST_CASES[e.target.value];
            if (testCase) {
                $("#format_fixer_test_input").val(testCase.input);
                $("#format_fixer_test_output").val('');
            }
        });

        // Handle test button click
        $("#format_fixer_test").on("click", () => {
            try {
                const inputText = $("#format_fixer_test_input").val().trim();
                if (!inputText) {
                    $("#format_fixer_test_output").val("Please enter some text to format");
                    return;
                }

                const result = processor.processText(inputText);
                const testCase = TEST_CASES[$("#format_fixer_test_case").val()];
                
                // If this matches a test case input, compare with expected
                if (testCase && inputText === testCase.input) {
                    const passed = result === testCase.expected;
                    $("#format_fixer_test_output").val(
                        `Test Case: ${testCase.name}\n` +
                        `Result: ${result}\n` +
                        `Expected: ${testCase.expected}\n` +
                        `Status: ${passed ? "✓ PASSED" : "✗ FAILED"}`
                    );
                } else {
                    // Just show the formatted result for custom input
                    $("#format_fixer_test_output").val(
                        `Input: ${inputText}\n` +
                        `Formatted: ${result}\n` +
                        `${result === inputText ? "No changes needed" : "Text reformatted"}`
                    );
                }
            } catch (error) {
                console.error('Format test error:', error);
                $("#format_fixer_test_output").val(
                    `Error formatting text: ${error.message}`
                );
            }
        });

        // Handle format button click
        $("#format_message").on("click", () => {
            const messageInput = $("#send_textarea");
            const currentText = messageInput.val();
            if (currentText) {
                const formattedText = processor.processText(currentText);
                messageInput.val(formattedText);
            }
        });

        // Handle process quotes toggle
        $("#format_fixer_process_quotes").on("change", onProcessQuotesToggleChange);
        
        // Initialize test case dropdown
        $("#format_fixer_test_case").trigger("change");
    } catch (error) {
        console.error('Format Fixer initialization error:', error);
    }
});