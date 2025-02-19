import { extension_settings, getContext } from "../../../extensions.js";
import { registerSlashCommand } from "../../../slash-commands.js";

// Extension name
const extensionName = "ST-FormatFixer";

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
        expected: '*The cat was **very** cute* "He was *quite* happy"'
    },
    complex: {
        name: "Complex Mixed Formatting",
        input: '*"Where did they go?"* The cat wondered, watching the *mysterious* figure disappear into the *dark and *spooky* night.*',
        expected: '"Where did they go?" *The cat wondered, watching the **mysterious** figure disappear into the *dark and **spooky** night.*'
    },
    narrative_quote: {
        name: "Quote Within Narrative",
        input: '*The man needed no "help" to fetch his gun*',
        expected: '*The man needed no "help" to fetch his gun*'
    },
    ultimate: {
        name: "Ultimate Test Case",
        input: '*"Where did I learn those words?"* Fwench Fwy repeats, one paw tapping their chin thoughtfully. *"Hmm, let\'s see... a little bit from here, a little bit from there. You know, being an ancient, all-powerful wish dragon has its perks! I can peek into any reality, any time period, any... *website*."* They giggle, the sound like wind chimes mixed with a dial-up modem.',
        expected: '"Where did I learn those words?" *Fwench Fwy repeats, one paw tapping their chin thoughtfully.* "Hmm, let\'s see... a little bit from here, a little bit from there. You know, being an ancient, all-powerful wish dragon has its perks! I can peek into any reality, any time period, any... **website**." *They giggle, the sound like wind chimes mixed with a dial-up modem.*'
    }
};

class TextProcessor {
    constructor() {
        this.debugLog = [];
    }

    processText(text) {
        try {
            const original = text;
            const normalized = this.normalizeText(text);
            const mapping = this.createPositionMapping(original, normalized);
            let result = this.processQuotesWithContext(normalized, mapping);
            result = this.processNarrativeWithContext(result, mapping);
            result = this.recoverBoldText(result, original, mapping);
            return this.fixSpacing(result);
        } catch (error) {
            console.error('Format Fixer error:', error);
            return text;
        }
    }

    normalizeText(text) {
        // Remove all asterisks but preserve spacing
        return text.replace(/\*/g, '');
    }

    createPositionMapping(original, normalized) {
        const mapping = {
            quotes: [],
            emphasis: [],
            sections: []
        };

        // Find quotes and their context
        let quoteMatch;
        const quoteRegex = /("[^"]*")/g;
        while ((quoteMatch = quoteRegex.exec(normalized)) !== null) {
            const quote = quoteMatch[0];
            const normalizedStart = quoteMatch.index;
            const normalizedEnd = normalizedStart + quote.length;

            // Find corresponding position in original text
            const searchStart = mapping.quotes.length > 0 
                ? mapping.quotes[mapping.quotes.length - 1].originalEnd 
                : 0;
            const originalIndex = original.indexOf(quote, searchStart);

            mapping.quotes.push({
                text: quote,
                normalizedStart,
                normalizedEnd,
                originalStart: originalIndex,
                originalEnd: originalIndex + quote.length,
                wasDirectlyEmphasized: this.isDirectlyEmphasized(original, originalIndex, quote.length),
                wasInEmphasis: this.wasInsideEmphasis(original, originalIndex)
            });
        }

        // Find emphasis sections
        let emphasisMatch;
        const emphasisRegex = /\*((?:[^*]|\*\*)*?)\*/g;
        while ((emphasisMatch = emphasisRegex.exec(original)) !== null) {
            const content = emphasisMatch[1];
            mapping.emphasis.push({
                text: content,
                originalStart: emphasisMatch.index,
                originalEnd: emphasisMatch.index + emphasisMatch[0].length,
                wasNested: content.includes('*')
            });
        }

        return mapping;
    }

    isDirectlyEmphasized(text, position, length) {
        const before = position > 0 ? text[position - 1] : '';
        const after = position + length < text.length ? text[position + length] : '';
        return before === '*' && after === '*';
    }

    wasInsideEmphasis(text, position) {
        let asteriskCount = 0;
        for (let i = 0; i < position; i++) {
            if (text[i] === '*' && text[i+1] !== '*') {
                asteriskCount++;
            }
        }
        return asteriskCount % 2 === 1;
    }

    processQuotesWithContext(text, mapping) {
        let result = text;
        const sections = [];
        let lastIndex = 0;

        mapping.quotes.forEach(quote => {
            // Add text before quote
            if (quote.normalizedStart > lastIndex) {
                const preText = result.slice(lastIndex, quote.normalizedStart).trim();
                if (preText) {
                    sections.push({
                        type: 'text',
                        content: preText
                    });
                }
            }

            // Determine if this quote was directly wrapped in emphasis or part of narrative
            if (quote.wasDirectlyEmphasized) {
                // Quote was directly wrapped in asterisks - remove emphasis
                sections.push({
                    type: 'quote',
                    content: quote.text,
                    keepEmphasis: false,
                    needsLeftSpace: lastIndex > 0,
                    needsRightSpace: quote.normalizedEnd < result.length
                });
            } else {
                // Quote might be part of narrative - preserve any emphasis
                sections.push({
                    type: 'quote',
                    content: quote.text,
                    keepEmphasis: quote.wasInEmphasis,
                    needsLeftSpace: lastIndex > 0,
                    needsRightSpace: quote.normalizedEnd < result.length
                });
            }

            lastIndex = quote.normalizedEnd;
        });

        // Add remaining text
        if (lastIndex < result.length) {
            const postText = result.slice(lastIndex).trim();
            if (postText) {
                sections.push({
                    type: 'text',
                    content: postText
                });
            }
        }

        // Join sections with proper spacing
        return sections.map((section, index) => {
            if (section.type === 'quote') {
                const spaceLeft = section.needsLeftSpace ? ' ' : '';
                const spaceRight = section.needsRightSpace ? ' ' : '';
                const content = section.keepEmphasis ? `*${section.content}*` : section.content;
                return `${spaceLeft}${content}${spaceRight}`;
            }
            return section.content;
        }).join('').trim();
    }

    processNarrativeWithContext(text, mapping) {
        const sections = this.splitIntoSections(text, mapping);
        return sections.map((section, index) => {
            if (section.type === 'quote') {
                return section.text;
            } else if (section.type === 'narrative' && section.text.trim()) {
                const wasEmphasized = this.wasNarrativeEmphasized(section, mapping);
                if (wasEmphasized) {
                    const needsLeftSpace = index > 0;
                    const needsRightSpace = index < sections.length - 1;
                    const spaceLeft = needsLeftSpace ? ' ' : '';
                    const spaceRight = needsRightSpace ? ' ' : '';
                    return `${spaceLeft}*${section.text.trim()}*${spaceRight}`;
                }
                return section.text;
            }
            return '';
        }).filter(Boolean).join('').trim();
    }

    splitIntoSections(text, mapping) {
        const sections = [];
        let lastIndex = 0;

        mapping.quotes.forEach(quote => {
            if (lastIndex < quote.normalizedStart) {
                const narrativeText = text.slice(lastIndex, quote.normalizedStart).trim();
                if (narrativeText) {
                    sections.push({
                        type: 'narrative',
                        text: narrativeText
                    });
                }
            }
            sections.push({
                type: 'quote',
                text: quote.text,
                mapping: quote
            });
            lastIndex = quote.normalizedEnd;
        });

        if (lastIndex < text.length) {
            const narrativeText = text.slice(lastIndex).trim();
            if (narrativeText) {
                sections.push({
                    type: 'narrative',
                    text: narrativeText
                });
            }
        }

        return sections;
    }

    wasNarrativeEmphasized(section, mapping) {
        const sectionText = section.text;
        // Check if this exact section or any part containing it was emphasized in original
        return mapping.emphasis.some(emphasis => {
            const normalizedEmphasis = this.normalizeText(emphasis.text);
            // Check for exact match first
            if (normalizedEmphasis === sectionText) return true;
            // Check if this section was part of a larger emphasized block
            if (normalizedEmphasis.includes(sectionText)) {
                // Make sure it wasn't just part of a word
                const start = normalizedEmphasis.indexOf(sectionText);
                const end = start + sectionText.length;
                const beforeChar = start > 0 ? normalizedEmphasis[start - 1] : ' ';
                const afterChar = end < normalizedEmphasis.length ? normalizedEmphasis[end] : ' ';
                return beforeChar === ' ' || afterChar === ' ';
            }
            return false;
        });
    }

    recoverBoldText(text, original, mapping) {
        let result = text;
        
        // First, find all emphasized sections that contain nested emphasis
        const nestedEmphasis = mapping.emphasis.filter(section => {
            // Check if this section contains an emphasized word
            return original.slice(section.originalStart, section.originalEnd)
                   .match(/\*[^*]+\*/);
        });

        // Process each nested section
        for (const section of nestedEmphasis) {
            const sectionText = original.slice(section.originalStart, section.originalEnd);
            // Find all inner emphasized words
            const innerMatch = sectionText.match(/\*([^*]+)\*/g);
            if (innerMatch) {
                for (const match of innerMatch) {
                    const innerText = match.replace(/\*/g, '');
                    const normalizedText = this.normalizeText(innerText);
                    // Replace in our result, but only if it's not part of a larger word
                    result = result.replace(
                        new RegExp(`(\\s|^)${this.escapeRegExp(normalizedText)}(\\s|$)`, 'g'),
                        `$1**${normalizedText}**$2`
                    );
                }
            }
        }
        
        return result;
    }

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    fixSpacing(text) {
        return text
            // Fix spaces around quotes
            .replace(/\s*([""][^""]*[""])\s*/g, ' $1 ')
            // Fix spaces around emphasis
            .replace(/\s*\*([^*]+)\*\s*/g, ' *$1* ')
            // Fix spaces around bold
            .replace(/\s*\*\*([^*]+)\*\*\s*/g, ' **$1** ')
            // Fix multiple spaces
            .replace(/\s+/g, ' ')
            // Trim ends
            .trim();
    }
}

// Initialize processor
const processor = new TextProcessor();

// Register slash command
registerSlashCommand("format", (_, text) => {
    if (!text) {
        return "Please provide text to format";
    }
    try {
        const formattedText = processor.processText(text);
        if (formattedText === text) {
            return "No formatting changes needed";
        }
        return formattedText;
    } catch (error) {
        console.error('Format command error:', error);
        return `Error formatting text: ${error.message}`;
    }
}, ["fmt"], "Format text with proper emphasis and quotes. Usage: /format your text here");

// Initialize extension
jQuery(async () => {
    try {
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
                            <label for="format_fixer_test_case">Test Case:</label>
                            <select id="format_fixer_test_case">
                                <option value="basic">Basic Quote and Narrative</option>
                                <option value="nested">Nested Emphasis</option>
                                <option value="complex">Complex Mixed Formatting</option>
                                <option value="narrative_quote">Quote Within Narrative</option>
                                <option value="ultimate">Ultimate Test Case</option>
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
            const testCase = TEST_CASES[$("#format_fixer_test_case").val()];
            if (testCase) {
                const result = processor.processText(testCase.input);
                const passed = result === testCase.expected;
                
                $("#format_fixer_test_output").val(
                    `Result: ${result}\n` +
                    `Expected: ${testCase.expected}\n` +
                    `Status: ${passed ? "✓ PASSED" : "✗ FAILED"}`
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

        // Initialize test case dropdown
        $("#format_fixer_test_case").trigger("change");
    } catch (error) {
        console.error('Format Fixer initialization error:', error);
    }
});