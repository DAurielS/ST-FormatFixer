# Format Fixer Extension for SillyTavern

A powerful text formatting extension for SillyTavern that automatically corrects common formatting issues, with special focus on proper emphasis handling and narrative flow.

## Features

- Smart quote and narrative section detection
- Proper emphasis handling (italics and bold)
- Intelligent spacing correction around quotes and emphasis
- Normalization of "smart" typography characters
- Preservation of code blocks and CYOA-style options
- Support for `<think>` tags
- Extended test cases suite
- Slash command support
- STScript Quick Reply templates

## Installation

1. Open SillyTavern's Extensions menu
2. Click "Install Extension"
3. Paste the GitHub repository URL
4. Enable the extension in the Extensions panel

## Usage

### Slash Command
Use `/format` or `/fmt` followed by your text:
```
/format *"Hello,"* she said *"I'm *very* happy to meet you."*
```

### Quick Reply Templates

#### Fix My Format
```
/format {{input}} |
/setinput |
```

#### AutoFormat (Invisible, Execute on AI message)
```
/messages names=off {{lastMessageId}} |
/let key=original |

/format {{var::original}} |
/format |
/format |
/let key=formatted |

/message-edit {{var::formatted}} |

/flushvar formatted |
/flushvar original |
```

### Test Interface
The extension includes a testing interface in the settings panel with several pre-configured test cases:
- Basic Quote and Narrative
- Nested Emphasis
- Complex Mixed Formatting
- Quote Within Narrative
- Ultimate Test Case
- CYOA Options
- Custom Input

## Processing Rules

The extension uses a multi-stage processing pipeline:

1. Smart Character Normalization:
   - Converts various "smart" typography characters to their standard ASCII equivalents
   - Handles quotes, apostrophes, dashes, ellipses, and special spaces

2. Quote Processing:
   - Removes asterisks that directly wrap quotes
   - Preserves formatting inside quotes
   - Handles consecutive quote marks
   - Example: `*"Hello"*` → `"Hello"`

3. Emphasis Processing:
   - Converts single-word italics to bold
   - Merges nested emphasis correctly
   - Cleans up triple asterisks
   - Example: `*The cat was *very* cute*` → `*The cat was **very** cute*`

4. Spacing Cleanup:
   - Removes unnecessary spaces around quotes and emphasis markers
   - Normalizes multiple spaces to single spaces
   - Example: `* text *` → `*text*`

5. Narrative Processing:
   - Adds italics to narrative sections between quotes
   - Preserves existing formatting
   - Handles quote boundaries intelligently
   - Example: `"Hi" she said` → `"Hi" *she said*`

6. Special Content Preservation:
   - Preserves code blocks (both single and triple backticks)
   - Maintains CYOA-style options [1., 2>, A), B.]
   - Protects `<think>` tags and their content
   - Normalizes excessive newlines

## Examples

### Basic Formatting
```
Input:  *"Hello,"* she said *"goodbye"*
Output: "Hello," *she said* "goodbye"
```

### Nested Emphasis
```
Input:  *The cat was *very* cute*
Output: *The cat was **very** cute*
```

### Complex Mixed Formatting
```
Input:  *"Where did they go?"* The cat wondered, watching the *mysterious* figure.
Output: "Where did they go?" *The cat wondered, watching the **mysterious** figure.*
```

### CYOA Options
```
Input:  *The ancient tome presents you with several choices:*

1. Open the mysterious door
2> Investigate the strange sounds
A) Talk to the old man
B. Run away as fast as possible

Output: *The ancient tome presents you with several choices:*

1. Open the mysterious door
2> Investigate the strange sounds
A) Talk to the old man
B. Run away as fast as possible
```

## Development

The extension uses a sophisticated multi-stage processing pipeline:
1. Smart character normalization
2. Quote boundary processing
3. Emphasis handling
4. Spacing cleanup
5. Narrative section processing
6. Special content preservation
7. Final cleanup and merging

Each stage carefully handles its specific formatting concerns while preserving the work of previous stages.

## Author

MonGauss (https://github.com/DAurielS/ST-FormatFixer)

## License

MIT License