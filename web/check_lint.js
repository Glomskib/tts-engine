const fs = require('fs');
const { execSync } = require('child_process');

try {
  const output = execSync('npm run lint', { encoding: 'utf8', cwd: __dirname, stdio: ['pipe', 'pipe', 'pipe'] });
  fs.writeFileSync('lint_check.txt', output, 'utf8');
} catch (e) {
  const combined = (e.stdout || '') + '\n' + (e.stderr || '');
  fs.writeFileSync('lint_check.txt', combined, 'utf8');
}

const content = fs.readFileSync('lint_check.txt', 'utf8');
const lines = content.split('\n').filter(l => l.includes('no-unused-vars') && !l.includes("'err'"));
console.log('Remaining no-unused-vars warnings (excluding err): ' + lines.length);
lines.forEach(l => console.log(l));
