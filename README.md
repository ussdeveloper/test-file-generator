# CSV Test Data Generator

A Node.js command-line tool for generating test CSV files based on source CSV structures.

## Author

UssDeveloper

## Description

This tool allows you to easily create test CSV files with automatically generated data. It can:

- Use an existing CSV file as a template
- Configure generation options for each column
- Save and reuse column configurations
- Generate thousands of records quickly

## Features

- **Interactive menu system** with keyboard navigation
- **Multiple data generation options** per column:
  - Random alphanumeric from source file values
  - Random numeric within a range
  - Random numeric from list
  - Random alphanumeric from list
  - Random alphanumeric strings
  - Random alphanumeric with custom prefix
  - Sequential numeric values
  - Values from list (with repeating)
- **Template system** to save configurations for future use
- **Column-specific editing** when using templates

## Installation

```bash
# Install dependencies
npm install
```

## Usage

```bash
# Run with command line argument for source CSV
node index.js path/to/source.csv

# Run with interactive prompt
node index.js
```

## Building Executable

To create a standalone Windows executable:

```bash
# Install dev dependencies
npm install --save-dev pkg

# Build for Windows
npm run build:win
```

The executable will be created in the `dist` directory.

## License

ISC
