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
        const quoteRegex = /([""][^""]*[""])/g;
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
                sections.push({
                    type: 'text',
                    content: result.slice(lastIndex, quote.normalizedStart).trim()
                });
            }

            // Add quote with proper spacing
            sections.push({
                type: 'quote',
                content: quote.text,
                needsLeftSpace: lastIndex > 0,
                needsRightSpace: quote.normalizedEnd < result.length
            });

            lastIndex = quote.normalizedEnd;
        });

        // Add remaining text
        if (lastIndex < result.length) {
            sections.push({
                type: 'text',
                content: result.slice(lastIndex).trim()
            });
        }

        // Join sections with proper spacing
        return sections.map((section, index) => {
            if (section.type === 'quote') {
                const spaceLeft = section.needsLeftSpace ? ' ' : '';
                const spaceRight = section.needsRightSpace ? ' ' : '';
                return `${spaceLeft}${section.content}${spaceRight}`;
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
        return mapping.emphasis.some(emphasis => {
            const normalizedEmphasis = this.normalizeText(emphasis.text);
            return section.text.includes(normalizedEmphasis) ||
                   normalizedEmphasis.includes(section.text);
        });
    }

    recoverBoldText(text, original, mapping) {
        let result = text;
        
        // Sort emphasis sections by length (longest first) to handle nested properly
        const sortedEmphasis = [...mapping.emphasis]
            .filter(e => e.wasNested)
            .sort((a, b) => b.text.length - a.text.length);

        for (const section of sortedEmphasis) {
            const normalizedContent = this.normalizeText(section.text);
            const position = result.indexOf(normalizedContent);
            if (position !== -1) {
                // Check if this content should be bold
                const shouldBeBold = this.shouldBeBold(section, original);
                if (shouldBeBold) {
                    result = result.slice(0, position) + 
                            '**' + normalizedContent + '**' + 
                            result.slice(position + normalizedContent.length);
                }
            }
        }
        
        return result;
    }

    shouldBeBold(section, original) {
        // Check if this section was nested emphasis in original
        const content = section.text;
        const start = section.originalStart;
        const end = section.originalEnd;
        
        // Count asterisks before this section
        let asterisksBefore = 0;
        for (let i = 0; i < start; i++) {
            if (original[i] === '*' && original[i+1] !== '*') {
                asterisksBefore++;
            }
        }
        
        // If we're inside another emphasis, this should be bold
        return asterisksBefore % 2 === 1;
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