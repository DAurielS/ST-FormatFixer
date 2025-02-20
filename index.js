import { extension_settings, getContext } from "../../../extensions.js";
import { SlashCommandParser } from "../../../slash-commands/SlashCommandParser.js";
import { SlashCommand } from "../../../slash-commands/SlashCommand.js";
import {
    ARGUMENT_TYPE,
    SlashCommandArgument,
    SlashCommandNamedArgument,
} from '../../../slash-commands/SlashCommandArgument.js';
import { ToolManager } from '../../../tool-calling.js';

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
        expected: '*The cat was **very** cute* "He was **quite** happy"'
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

    /**
     * Stage 0: Normalize smart quotes to regular quotes
     * Converts both opening (“) and closing (”) smart quotes to regular quotes (")
     */
    normalizeQuotes(text) {
        return text.replace(/[“”]/g, '"');
    }

    processText(text) {
        try {
            let result = text;
            
            // Stage 0: Normalize smart quotes to regular quotes
            result = this.normalizeQuotes(result);
            
            // Stage 1: Process quotes (keep the working version)
            result = this.processQuotes(result);
            
            // Stage 2: Convert single-word italics to bold
            result = this.processNestedEmphasis(result);
            
            // Stage 3: Clean up any triple asterisks
            result = this.cleanupTripleAsterisks(result);
            
            // Stage 4: Clean up lone asterisks in quotes
            result = this.cleanupLoneAsterisks(result);
            
            // Stage 5: Process narrative sections
            result = this.processNarrative(result);
            
            return result;
        } catch (error) {
            console.error('Format Fixer error:', error);
            return text;
        }
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
     * Stage 2: Process nested emphasis
     * Converts single-word italics to bold
     */
    processNestedEmphasis(text) {
        // Convert single-word italics to bold
        return text.replace(/\*([^\s*]+)\*/g, '**$1**');
    }

    /**
     * Stage 3: Clean up triple asterisks
     * Replaces any sequence of 3 or more asterisks with 2 asterisks
     */
    cleanupTripleAsterisks(text) {
        return text.replace(/\*{3,}/g, '**');
    }

    /**
     * Stage 4: Clean up lone asterisks within quotes
     * Only removes asterisks that appear to be broken formatting
     */
    cleanupLoneAsterisks(text) {
        // Specifically target asterisks within quotes that:
        // 1. Have a word character on one side only
        // 2. Don't appear to be part of a bold pattern
        return text.replace(/"[^"]*"/g, match =>
            match.replace(/\b\*(?!\*)|(?<!\*)\*\b/g, '')
        );
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
            else if (section.type === 'quote') {
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
     * Split text between standalone quotes while preserving quotes and original spacing
     */
    splitBetweenQuotes(text) {
        // Split on quotes and newlines
        let sections = [];
        let buffer = '';
        let inEmphasis = false;
        
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
            
            if (char === '*') {
                inEmphasis = !inEmphasis;
                buffer += char;
            }
            else if (char === '"' && !inEmphasis) {
                // Found a quote outside emphasis
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

// Format command function
function formatCommand(_, text) {
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

        // Initialize test case dropdown
        $("#format_fixer_test_case").trigger("change");
    } catch (error) {
        console.error('Format Fixer initialization error:', error);
    }
});