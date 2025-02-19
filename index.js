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
    }
};

/**
 * Format Fixer Text Processor
 * Handles text formatting with proper quote, narrative, and emphasis processing
 */
class TextProcessor {
    constructor() {
        this.debugLog = [];
    }

    /**
     * Process text through all formatting stages
     */
    processText(text) {
        try {
            let result = text;
            
            // Stage 1: Process quotes
            result = this.processQuotes(result);
            
            // Stage 2: Process narrative sections
            result = this.processNarrative(result);
            
            // Stage 3: Process nested emphasis
            result = this.processNestedEmphasis(result);
            
            return result;
        } catch (error) {
            console.error('Format Fixer error:', error);
            return text; // Return original text on error
        }
    }

    /**
     * Stage 1: Process quotes
     * Removes asterisks that directly wrap quotes
     */
    processQuotes(text) {
        // First handle directly wrapped quotes
        text = text.replace(/\*([""].*?[""])\*/g, '$1');
        
        // Then handle any remaining quotes with emphasis
        const parts = this.splitBetweenQuotes(text);
        return parts.map(part => {
            if (this.isQuote(part)) {
                // Remove any asterisks directly touching quotes
                return part.replace(/\*?([""].*?[""])\*?/g, '$1');
            }
            return part;
        }).join('');
    }

    /**
     * Stage 2: Process narrative sections
     * Adds italics to unformatted narrative sections
     */
    processNarrative(text) {
        const parts = this.splitBetweenQuotes(text);
        return parts.map(part => {
            if (this.isNarrativeSection(part) && !this.isItalicized(part)) {
                return `*${part.trim()}*`;
            }
            return part;
        }).join('');
    }

    /**
     * Stage 3: Process nested emphasis
     * Converts nested italics to bold in narrative sections only
     */
    processNestedEmphasis(text) {
        const parts = this.splitOnEmphasis(text);
        return parts.map(part => {
            if (this.isItalicizedNarrative(part) && this.hasNestedItalics(part)) {
                return part.replace(/\*([^*]*?)\*([^*]+?)\*([^*]*?)\*/g, '*$1**$2**$3*');
            }
            return part;
        }).join('');
    }

    // Helper Functions

    /**
     * Check if text is a quote directly wrapped in asterisks
     */
    isDirectlyWrappedQuote(text) {
        return /^\*[""].*[""]\*$/.test(text);
    }

    /**
     * Check if text is a quoted section
     */
    isQuote(text) {
        return /^[""].*[""]$/.test(text);
    }

    /**
     * Check if text is narrative (not a quote)
     */
    isNarrativeSection(text) {
        return !this.isQuote(text) && text.trim().length > 0;
    }

    /**
     * Check if text is already italicized
     */
    isItalicized(text) {
        return /^\*[^*]+\*$/.test(text);
    }

    /**
     * Check if text is italicized narrative (not a quote)
     */
    isItalicizedNarrative(text) {
        return this.isItalicized(text) && !this.isQuote(text.slice(1, -1));
    }

    /**
     * Check if text has nested italics
     */
    hasNestedItalics(text) {
        return /\*[^*]*\*[^*]+\*[^*]*\*/.test(text);
    }

    /**
     * Split text on quote boundaries while preserving quotes
     */
    splitOnQuotes(text) {
        return text.split(/(?=["""])|(?<=["""])/);
    }

    /**
     * Split text between quotes
     */
    splitBetweenQuotes(text) {
        return text.split(/([""][^""]*[""])/);
    }

    /**
     * Split text on complete emphasis sections
     */
    splitOnEmphasis(text) {
        const parts = [];
        let current = '';
        let depth = 0;
        
        for (const char of text) {
            if (char === '*') {
                depth = (depth + 1) % 2;
                if (depth === 0 && current.length > 0) {
                    parts.push(current + char);
                    current = '';
                    continue;
                }
            }
            current += char;
        }
        
        if (current) parts.push(current);
        return parts;
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