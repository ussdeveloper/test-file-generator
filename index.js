const fs = require('fs');
const path = require('path');
const csvParse = require('csv-parse/sync');
const csvStringify = require('csv-stringify/sync');
const inquirer = require('inquirer');

// Function to generate random number within a range
function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Function to generate random string
function getRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Function to generate random string with prefix
function getRandomStringWithPrefix(prefix, length) {
  return prefix + getRandomString(length);
}

// Function to pick a random item from a list
function getRandomFromList(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Helper function to get unique values from a column
function getUniqueValuesFromColumn(records, header) {
  const values = records.map(record => record[header]);
  // Filter out duplicates and undefined/null values
  return [...new Set(values)].filter(val => val !== undefined && val !== null && val !== '');
}

// Function to load saved configurations
function loadConfigurations() {
  try {
    if (fs.existsSync('config.json')) {
      const configData = fs.readFileSync('config.json', 'utf8');
      return JSON.parse(configData);
    }
  } catch (error) {
    console.error('Error loading configurations:', error.message);
  }
  return { templates: [] };
}

// Function to save a configuration
function saveConfiguration(name, sourceFile, columnConfigurations, numRecords, includeHeader) {
  try {
    const config = loadConfigurations();
    
    // Create a new template or update existing
    const templateIndex = config.templates.findIndex(t => t.name === name);
    const newTemplate = {
      name,
      sourceFile,
      columnConfigurations,
      numRecords,
      includeHeader,
      createdAt: new Date().toISOString()
    };
    
    if (templateIndex >= 0) {
      config.templates[templateIndex] = newTemplate;
    } else {
      config.templates.push(newTemplate);
    }
    
    // Save to file
    fs.writeFileSync('config.json', JSON.stringify(config, null, 2));
    console.log(`Configuration '${name}' saved successfully.`);
    
    return true;
  } catch (error) {
    console.error('Error saving configuration:', error.message);
    return false;
  }
}

// Main function
async function main() {
  try {
    // Check for saved configurations
    const config = loadConfigurations();
    let useTemplate = false;
    let templateConfig = null;
    
    if (config.templates && config.templates.length > 0) {
      // Ask if user wants to use a saved template
      const templateAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'choice',
          message: 'Do you want to use a saved template or create a new configuration?',
          choices: [
            { name: 'Create new configuration', value: 'new' },
            ...config.templates.map(t => ({ name: `Template: ${t.name} (${t.sourceFile})`, value: t.name }))
          ]
        }
      ]);
      
      if (templateAnswer.choice !== 'new') {
        useTemplate = true;
        templateConfig = config.templates.find(t => t.name === templateAnswer.choice);
        console.log(`Using template: ${templateConfig.name}`);
      }
    }
    
    // Get source CSV file - either from template, command-line argument, or by asking user
    let sourceFilePath;
    let records;
    let headers;
    
    if (useTemplate) {
      sourceFilePath = templateConfig.sourceFile;
      console.log(`Using source file from template: ${sourceFilePath}`);
    } else if (process.argv.length > 2) {
      sourceFilePath = process.argv[2];
      console.log(`Using source CSV file from command-line argument: ${sourceFilePath}`);
    } else {
      // Ask for source CSV file if not provided as argument
      const fileAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'sourcePath',
          message: 'Enter path to source CSV file:',
          validate: function(input) {
            if (!fs.existsSync(input)) {
              return 'File not found. Please enter a valid file path.';
            }
            return true;
          }
        }
      ]);
      sourceFilePath = fileAnswer.sourcePath;
    }
    
    if (!fs.existsSync(sourceFilePath)) {
      console.error(`File not found: ${sourceFilePath}`);
      process.exit(1);
    }

    // Read and parse the source CSV
    const sourceData = fs.readFileSync(sourceFilePath, 'utf8');
    records = csvParse.parse(sourceData, { columns: true, skip_empty_lines: true });
    
    if (records.length === 0) {
      console.error('Source CSV file is empty or could not be parsed');
      process.exit(1);
    }

    // Get headers from the first record
    headers = Object.keys(records[0]);
    
    // Initialize column configurations
    let columnConfigurations = [];
    let numRecords;
    let includeHeader;
    
    if (useTemplate) {
      // Use configurations from template
      columnConfigurations = [...templateConfig.columnConfigurations];
      numRecords = templateConfig.numRecords;
      includeHeader = templateConfig.includeHeader;
      
      // Ask if user wants to edit any column configurations
      const editAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'edit',
          message: 'Do you want to edit any column configurations?',
          choices: [
            { name: 'No', value: false },
            { name: 'Yes', value: true }
          ],
          default: 0 // Default to "No"
        }
      ]);
      
      if (editAnswer.edit) {
        // Let user select which columns to edit
        const columnsToEdit = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'columns',
            message: 'Select columns to edit:',
            choices: headers.map(h => ({ name: h, value: h }))
          }
        ]);
        
        // Edit selected columns
        for (const header of columnsToEdit.columns) {
          const columnIndex = columnConfigurations.findIndex(c => c.header === header);
          if (columnIndex >= 0) {
            // Remove existing config for this column
            columnConfigurations.splice(columnIndex, 1);
          }
          
          // Configure this column
          const config = await configureColumn(header, records);
          columnConfigurations.push(config);
        }
      }
    } else {
      // Show some sample values for each column and configure from scratch
      for (const header of headers) {
        console.log(`\nColumn: ${header}`);
        
        // Get sample values
        const sampleValues = records.slice(0, 5).map(record => record[header]);
        console.log(`Sample values: ${sampleValues.join(', ')}`);
        
        // Configure this column
        const config = await configureColumn(header, records);
        columnConfigurations.push(config);
      }
      
      // Ask for number of records to generate using a list for better selection
      const recordOptions = [100, 500, 1000, 2000, 5000, 10000];
      const recordsAnswer = await inquirer.prompt([
        {
          type: 'list', 
          name: 'numRecords',
          message: 'How many records to generate?',
          choices: [
            ...recordOptions.map(num => ({ name: `${num} records`, value: num })),
            { name: 'Custom number', value: 'custom' }
          ],
          default: 1 // Default to 500 records
        }
      ]);
      
      if (recordsAnswer.numRecords === 'custom') {
        const customAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'customRecords',
            message: 'Enter custom number of records:',
            validate: function(input) {
              const num = parseInt(input);
              if (isNaN(num) || num <= 0) {
                return 'Please enter a valid positive number';
              }
              return true;
            },
            filter: input => parseInt(input)
          }
        ]);
        numRecords = customAnswer.customRecords;
      } else {
        numRecords = recordsAnswer.numRecords;
      }
      
      // Ask for header inclusion
      const headerAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'includeHeader',
          message: 'Include header row?',
          choices: [
            { name: 'Yes', value: true },
            { name: 'No', value: false }
          ],
          default: 0 // Default to "Yes"
        }
      ]);
      includeHeader = headerAnswer.includeHeader;
    }
    
    // Generate the test data
    const outputData = [];
    
    for (let i = 0; i < numRecords; i++) {
      const record = {};
      
      for (const config of columnConfigurations) {
        switch (config.type) {
          case '1': // Random numeric range
            record[config.header] = getRandomNumber(config.min, config.max);
            break;
          case '2': // Random numeric from list
          case '3': // Random alphanumeric from list
            record[config.header] = getRandomFromList(config.list);
            break;
          case '4': // Random alphanumeric strings
            record[config.header] = getRandomString(config.length);
            break;
          case '5': // Sequential range
            record[config.header] = config.start + (i * config.step);
            break;
          case '6': // Values from list (repeating if needed)
            record[config.header] = config.list[i % config.list.length];
            break;
          case '7': // Random alphanumeric with prefix
            record[config.header] = getRandomStringWithPrefix(config.prefix, config.length);
            break;
        }
      }
      
      outputData.push(record);
    }
    
    // Create output CSV
    const outputAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'outputFilePath',
        message: 'Enter path for output CSV file:',
        default: 'output.csv'
      }
    ]);
    const outputFilePath = outputAnswer.outputFilePath;
    
    // Generate CSV content
    const csvContent = csvStringify.stringify(outputData, { header: includeHeader });
    
    // Write to file
    fs.writeFileSync(outputFilePath, csvContent);
    
    console.log(`Successfully generated ${numRecords} records to ${outputFilePath}`);

    // Ask if user wants to save this configuration as a template
    if (!useTemplate) {
      const saveAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'save',
          message: 'Do you want to save this configuration as a template for future use?',
          choices: [
            { name: 'Yes', value: true },
            { name: 'No', value: false }
          ],
          default: 0 // Default to "Yes"
        }
      ]);
      
      if (saveAnswer.save) {
        const nameAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'templateName',
            message: 'Enter a name for this template:',
            validate: function(input) {
              if (!input.trim()) {
                return 'Name cannot be empty';
              }
              return true;
            }
          }
        ]);
        
        saveConfiguration(
          nameAnswer.templateName,
          sourceFilePath,
          columnConfigurations,
          numRecords,
          includeHeader
        );
      }
    }

  } catch (error) {
    console.error('An error occurred:', error);
  }
}

// Function to configure a single column
async function configureColumn(header, records) {
  // Get unique values from this column to use as default for lists
  const uniqueValues = getUniqueValuesFromColumn(records, header);
  
  // Ask for generation type using inquirer
  const typeAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'generationType',
      message: 'Choose generation type:',
      choices: [
        { name: 'Random alphanumeric (from source file)', value: '3-source' },
        { name: 'Random numeric (range)', value: '1' },
        { name: 'Random numeric (from list)', value: '2' },
        { name: 'Random alphanumeric (from list)', value: '3' },
        { name: 'Random alphanumeric strings', value: '4' },
        { name: 'Random alphanumeric with prefix', value: '7' },
        { name: 'Sequential range numeric', value: '5' },
        { name: 'Values from list', value: '6' }
      ],
      default: 0 // Default to "Random alphanumeric (from source file)"
    }
  ]);
  
  let generationType = typeAnswer.generationType;
  
  const columnConfig = {
    header,
    type: generationType === '3-source' ? '3' : generationType
  };
  
  switch (generationType) {
    case '1': // Random numeric range
      const rangeAnswer = await inquirer.prompt([
        {
          type: 'number',
          name: 'min',
          message: 'Enter minimum value:',
          default: 0
        },
        {
          type: 'number',
          name: 'max',
          message: 'Enter maximum value:',
          default: 100
        }
      ]);
      columnConfig.min = rangeAnswer.min;
      columnConfig.max = rangeAnswer.max;
      break;
    
    case '2': // Random numeric from list
      // First ask if they want to use values from source
      const useSourceNum = await inquirer.prompt([
        {
          type: 'list',
          name: 'useSource',
          message: 'Use values from source file?',
          choices: [
            { name: 'Yes, use values from source file', value: true },
            { name: 'No, I will enter custom values', value: false }
          ],
          default: 0 // Default to "Yes"
        }
      ]);
      
      if (useSourceNum.useSource) {
        // Extract numeric values from the column
        const numericValues = uniqueValues
          .map(val => Number(val))
          .filter(val => !isNaN(val));
        
        if (numericValues.length === 0) {
          console.log('No valid numeric values found in column. Please enter custom values.');
          const numListAnswer = await inquirer.prompt([
            {
              type: 'input',
              name: 'numericList',
              message: 'Enter comma-separated list of numbers:',
              filter: input => input.split(',').map(Number)
            }
          ]);
          columnConfig.list = numListAnswer.numericList;
        } else {
          columnConfig.list = numericValues;
          console.log(`Using ${numericValues.length} unique numeric values from source column.`);
        }
      } else {
        const numListAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'numericList',
            message: 'Enter comma-separated list of numbers:',
            filter: input => input.split(',').map(Number)
          }
        ]);
        columnConfig.list = numListAnswer.numericList;
      }
      break;
    
    case '3-source': // Default choice: Random alphanumeric from source file
      if (uniqueValues.length === 0) {
        console.log('No valid values found in column. Please enter custom values.');
        const alphaListAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'alphaList',
            message: 'Enter comma-separated list of values:',
            filter: input => input.split(',').map(v => v.trim())
          }
        ]);
        columnConfig.list = alphaListAnswer.alphaList;
      } else {
        columnConfig.list = uniqueValues;
        console.log(`Using ${uniqueValues.length} unique values from source column.`);
      }
      break;
    
    case '3': // Random alphanumeric from list
    case '6': // Values from list
      // First ask if they want to use values from source
      const useSourceAlpha = await inquirer.prompt([
        {
          type: 'list',
          name: 'useSource',
          message: 'Use values from source file?',
          choices: [
            { name: 'Yes, use values from source file', value: true },
            { name: 'No, I will enter custom values', value: false }
          ],
          default: 0 // Default to "Yes"
        }
      ]);
      
      if (useSourceAlpha.useSource) {
        if (uniqueValues.length === 0) {
          console.log('No valid values found in column. Please enter custom values.');
          const alphaListAnswer = await inquirer.prompt([
            {
              type: 'input',
              name: 'alphaList',
              message: 'Enter comma-separated list of values:',
              filter: input => input.split(',').map(v => v.trim())
            }
          ]);
          columnConfig.list = alphaListAnswer.alphaList;
        } else {
          columnConfig.list = uniqueValues;
          console.log(`Using ${uniqueValues.length} unique values from source column.`);
        }
      } else {
        const alphaListAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'alphaList',
            message: 'Enter comma-separated list of values:',
            filter: input => input.split(',').map(v => v.trim())
          }
        ]);
        columnConfig.list = alphaListAnswer.alphaList;
      }
      break;
    
    case '4': // Random alphanumeric strings
      const lengthAnswer = await inquirer.prompt([
        {
          type: 'number',
          name: 'length',
          message: 'Enter length for random strings:',
          default: 10
        }
      ]);
      columnConfig.length = lengthAnswer.length;
      break;
    
    case '7': // Random alphanumeric with prefix
      const prefixAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'prefix',
          message: 'Enter prefix for random strings:',
          default: 'ID-'
        }
      ]);
      const prefixLengthAnswer = await inquirer.prompt([
        {
          type: 'number',
          name: 'length',
          message: 'Enter length for random part (after prefix):',
          default: 6
        }
      ]);
      columnConfig.prefix = prefixAnswer.prefix;
      columnConfig.length = prefixLengthAnswer.length;
      break;
    
    case '5': // Sequential range
      const seqAnswer = await inquirer.prompt([
        {
          type: 'number',
          name: 'start',
          message: 'Enter start value:',
          default: 1
        },
        {
          type: 'number',
          name: 'step',
          message: 'Enter step value:',
          default: 1
        }
      ]);
      columnConfig.start = seqAnswer.start;
      columnConfig.step = seqAnswer.step;
      break;
  }
  
  return columnConfig;
}

// Show usage information
function printUsage() {
  console.log('CSV Test Data Generator');
  console.log('Usage: node index.js [source-csv-file]');
  console.log('');
  console.log('If source CSV file is provided as a command-line argument, it will be used directly.');
  console.log('Otherwise, you will be prompted to enter the path to the source file.');
}

// Execute the main function
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  printUsage();
} else {
  main();
}