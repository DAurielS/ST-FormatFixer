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
        expected: '"Where did they go?" *The cat wondered, watching the **mysterious** figure disappear into the dark and **spooky** night.*'
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
    },
    cyoa: {
        name: "CYOA Options",
        input: '*The ancient tome presents you with several choices:*\n\n1. Open the mysterious door\n2> Investigate the strange sounds\nA) Talk to the old man\nB. Run away as fast as possible',
        expected: '*The ancient tome presents you with several choices:*\n\n1. Open the mysterious door\n2> Investigate the strange sounds\nA) Talk to the old man\nB. Run away as fast as possible'
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
            
            // Stage 6: Clean up any excessive newlines
            result = this.cleanupExcessNewlines(result);
            
            // Stage 7: Merge nested emphasis
            result = this.mergeNestedEmphasis(result);
            
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
        // Only match actual words (letters, numbers, and allowed punctuation)
        return text.replace(/\*([\w'-]+)\*/g, '**$1**');
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
            
            // Check for code blocks first
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
            // Check for lone closing think tag first
            else if (char === '<' && i + 7 < text.length && text.slice(i, i + 8) === '</think>') {
                // Capture all text from start of buffer up to and including the tag
                let thinkBuffer = buffer + '</think>';
                i += 7;  // Move past '</think>'
                
                pushBuffer();  // Push content as think block
                sections.push({
                    raw: thinkBuffer,
                    text: thinkBuffer,
                    type: 'code'  // Reuse code type since we want the same behavior
                });
                buffer = '';  // Clear buffer since we've processed everything
            }
            // Check for complete think tags
            else if (char === '<' && i + 6 < text.length && text.slice(i, i + 7) === '<think>') {
                let thinkBuffer = '<think>';
                i += 6;  // Move past '<think>'
                
                // Capture everything until closing tag
                i++;
                while (i < text.length) {
                    if (text[i] === '<' && i + 7 < text.length && text.slice(i, i + 8) === '</think>') {
                        thinkBuffer += '</think>';
                        i += 7;  // Move past '</think>'
                        break;
                    }
                    thinkBuffer += text[i];
                    i++;
                }
                
                pushBuffer();  // Push any content before the think block
                sections.push({
                    raw: thinkBuffer,
                    text: thinkBuffer,
                    type: 'code'  // Reuse code type since we want the same behavior
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
                                <option value="cyoa">CYOA Options</option>
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

        // Initialize test case dropdown
        $("#format_fixer_test_case").trigger("change");
    } catch (error) {
        console.error('Format Fixer initialization error:', error);
    }
});