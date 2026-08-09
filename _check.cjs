const fs = require('fs');
const lines = fs.readFileSync('C:\\Users\\YShio\\f7goods\\server.js', 'utf-8').split('\n');
for (let i = 0; i < lines.length; i++) {
  const ln = i + 1;
  const line = lines[i];
  if (line.includes('writeJSON(') && ln !== 184 && !line.includes('await writeJSON(') && !line.includes('async function writeJSON(')) {
    console.log(ln + ': ' + line.trimEnd());
  }
}
console.log('---');
let count = 0;
for (const line of lines) {
  if (line.includes('writeJSON(')) count++;
}
console.log('Total writeJSON( occurrences: ' + count);
