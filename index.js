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
        let result = text;
        
        // Only remove emphasis that directly wraps entire quotes
        result = result.replace(/\*([""][^""]*[""])\*/g, '$1');
        
        // Don't remove emphasis from within quotes
        return result;
    }

    /**
     * Stage 2: Process narrative sections
     * Adds italics to unformatted narrative sections
     */
    processNarrative(text) {
        // Split text into sections by quotes
        const parts = this.splitBetweenQuotes(text);
        let result = '';
        
        // Keep track of whether we're in an emphasized section
        let inEmphasis = false;
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!part) continue;
            
            if (this.isQuote(part)) {
                // Always close any open emphasis before a quote
                if (inEmphasis) {
                    result = result.trimEnd() + '*';
                    inEmphasis = false;
                }
                result += part;
            } else {
                // Handle narrative sections
                const trimmed = part.trim();
                if (trimmed.length > 0) {
                    // Don't add emphasis if:
                    // 1. Text already has emphasis markers
                    // 2. We're continuing an emphasized section
                    // 3. It's just whitespace
                    if (!trimmed.includes('*') && !inEmphasis && !this.isItalicized(trimmed)) {
                        result += (result && !result.endsWith(' ') ? ' ' : '') + '*';
                        inEmphasis = true;
                        result += trimmed;
                    } else {
                        result += part;
                    }
                } else {
                    // For whitespace sections
                    if (inEmphasis) {
                        result = result.trimEnd() + '*';
                        inEmphasis = false;
                    }
                    result += part;
                }
            }
        }
        
        // Close any open emphasis at the end
        if (inEmphasis) {
            result = result.trimEnd() + '*';
        }
        
        return result.trim();
    }

    /**
     * Stage 3: Process nested emphasis
     * Converts nested italics to bold in narrative sections only
     */
    /**
     * Find sections of text that have emphasis within emphasis
     */
    findInnerEmphasis(text) {
        const sections = [];
        let depth = 0;
        let start = -1;
        let outerStart = -1;

        for (let i = 0; i < text.length; i++) {
            if (text[i] === '*') {
                if (depth === 0) {
                    // Start of outer emphasis
                    outerStart = i;
                    depth++;
                } else if (depth === 1) {
                    if (text[i+1] === '*') {
                        // Skip double asterisks
                        i++;
                        continue;
                    }
                    // Found inner emphasis start
                    start = i;
                    depth++;
                } else if (depth === 2 && start !== -1) {
                    // Found inner emphasis end
                    if (outerStart !== -1) {
                        sections.push([start, i]);
                    }
                    start = -1;
                    depth--;
                }
            }
        }
        return sections;
    }

    /**
     * Convert inner emphasis sections to bold
     */
    convertToBold(text, sections) {
        let result = text;
        // Process sections from end to start to avoid offset issues
        for (let i = sections.length - 1; i >= 0; i--) {
            const [start, end] = sections[i];
            const innerText = text.slice(start + 1, end);
            result = result.slice(0, start) + '**' + innerText + '**' + result.slice(end + 1);
        }
        return result;
    }

    /**
     * Process nested emphasis in text
     */
    processNestedEmphasis(text) {
        // First pass: Find inner emphasis sections
        const sections = this.findInnerEmphasis(text);
        // Second pass: Convert these sections to bold
        return this.convertToBold(text, sections);
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
     * Check if text has nested emphasis
     */
    hasNestedEmphasis(text) {
        return /\*[^*]*\*[^*]+\*[^*]*\*/.test(text);
    }

    /**
     * Split text between quotes while preserving quotes and spaces
     */
    splitBetweenQuotes(text) {
        return text.split(/([""][^""]*[""])/g).filter(Boolean);
    }

    /**
     * Check if text needs emphasis (not a quote, not already emphasized)
     */
    needsEmphasis(text) {
        const trimmed = text.trim();
        return trimmed.length > 0 && !this.isQuote(trimmed) && !this.isItalicized(trimmed);
    }

    /**
     * Add proper spacing around text
     */
    addSpacing(text, needsLeftSpace, needsRightSpace) {
        return (needsLeftSpace ? ' ' : '') + text + (needsRightSpace ? ' ' : '');
    }

    /**
     * Extract basic sections that are wrapped in emphasis marks
     */
    getEmphasisSections(text) {
        const sections = [];
        let current = '';
        let inEmphasis = false;
        
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '*' && text[i+1] !== '*' && (!inEmphasis || i === text.length-1 || text[i+1] !== '*')) {
                // Only process single asterisks, not double
                if (!inEmphasis) {
                    if (current) sections.push({type: 'plain', text: current});
                    current = '*';
                    inEmphasis = true;
                } else {
                    current += '*';
                    sections.push({type: 'emphasis', text: current});
                    current = '';
                    inEmphasis = false;
                }
            } else {
                current += text[i];
            }
        }
        
        if (current) sections.push({type: inEmphasis ? 'emphasis' : 'plain', text: current});
        return sections;
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