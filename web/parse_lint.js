const fs = require('fs');
const path = require('path');
const lines = fs.readFileSync(path.join(__dirname, 'lint_output.txt'), 'utf8').split('\n');
let currentFile = null;
const results = [];
for (const line of lines) {
  const trimmed = line.trim();
  if (line.startsWith('C:')) {
    currentFile = trimmed;
  } else if (trimmed.includes('no-unused-vars') && !trimmed.includes("'err'") && currentFile) {
    results.push(currentFile + '  |  ' + trimmed);
  }
}
results.forEach(r => console.log(r));
