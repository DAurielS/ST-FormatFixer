# Format Fixer Extension for SillyTavern

A SillyTavern extension that automatically corrects common formatting issues in AI responses, particularly focusing on proper handling of emphasis (asterisks) and bold text.

## Features

- Removes unnecessary asterisks around quotes
- Properly italicizes narrative sections
- Converts nested emphasis to bold text
- Preserves formatting within quotes
- Simple UI with test cases
- Slash command support

## Installation

1. Place the extension files in your SillyTavern extensions directory
2. Enable the extension in SillyTavern's extension settings

## Usage

### Format Button

A format button (magic wand icon) is added to the message input area. Click it to format the current message.

### Slash Command

Use the `/format` command followed by your text:
```
/format *"Hello,"* she said *"I'm *very* happy to meet you."*
```

### Test Cases

The extension includes several test cases accessible through the settings panel:
- Basic Quote and Narrative
- Nested Emphasis
- Complex Mixed Formatting

## Processing Rules

1. Quote Processing:
   - Removes asterisks that directly wrap quotes
   - Preserves formatting inside quotes
   - Example: `*"Hello"*` → `"Hello"`

2. Narrative Italicization:
   - Adds italics to narrative sections between quotes
   - Preserves existing formatting
   - Example: `"Hi" she said` → `"Hi" *she said*`

3. Nested Emphasis:
   - Converts nested italics to bold in narrative sections
   - Does not modify emphasis within quotes
   - Example: `*The cat was *very* cute*` → `*The cat was **very** cute*`

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

## Development

The extension uses a multi-stage processing pipeline:
1. Quote boundary processing
2. Narrative section handling
3. Nested emphasis conversion

Each stage carefully handles its specific formatting concerns while preserving the work of previous stages.

## Author

MonGauss (https://github.com/DAurielS/ST-FormatFixer)

## License

MIT License