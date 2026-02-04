const fs = require('fs');
const content = fs.readFileSync('lint_check.txt', 'utf8');
const lines = content.split('\n');
let currentFile = '';
const results = [];

for (const line of lines) {
  // Detect file path lines (absolute paths starting with drive letter)
  if (/^[A-Z]:\\/.test(line) && !line.includes('warning') && !line.includes('error')) {
    currentFile = line.trim();
    continue;
  }
  if (line.includes('no-unused-vars') && !line.includes("'err'")) {
    results.push(currentFile + ' | ' + line.trim());
  }
}

console.log('Total remaining: ' + results.length);
results.forEach(r => console.log(r));
