const fs = require('fs');
const lines = fs.readFileSync('C:\\Users\\YShio\\f7goods\\server.js', 'utf-8').split('\n');

// Find all lines with await writeJSON
const callLines = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('await writeJSON(')) {
    callLines.push(i);
  }
}

// For each call line, find the enclosing function and check if it's async
const missingAsync = new Set();

for (const callIdx of callLines) {
  // Walk backwards to find function definition
  let braceDepth = 0;
  for (let i = callIdx - 1; i >= 0; i--) {
    const line = lines[i];
    
    // Count braces from the line below
    for (const ch of line) {
      if (ch === '}') braceDepth++;
      if (ch === '{') braceDepth--;
    }
    
    if (braceDepth < 0) break; // Went past function boundary
    
    // Check for function definition patterns
    if (/^\s*(function\s+\w+\s*\(|const\s+\w+\s*=\s*(?:async\s+)?(?:function\s*)?\(|app\.(get|post|put|delete|use)\s*\()/.test(line)) {
      if (!line.includes('async')) {
        missingAsync.add({ lineNum: i + 1, line: line.trimEnd() });
      }
      break;
    }
    
    // Check for arrow function callback pattern: (req, res) => {
    if (/\)\s*=>\s*\{/.test(line) || /function\s*\(req/.test(line)) {
      // Check the line above for app.method
      let foundApp = false;
      for (let j = i; j >= Math.max(0, i - 3); j--) {
        if (/app\.(get|post|put|delete|use)\s*\(/.test(lines[j])) {
          foundApp = true;
          if (!lines[j].includes('async') && !line.includes('async')) {
            missingAsync.add({ lineNum: j + 1, line: lines[j].trimEnd() });
          }
          break;
        }
      }
      if (foundApp) break;
      // Standalone function
      if (!line.includes('async')) {
        missingAsync.add({ lineNum: i + 1, line: line.trimEnd() });
      }
      break;
    }
  }
}

// Also specifically check app.method lines - find the actual callback
// Some patterns span multiple lines like:
// app.get('/api/...', 
//   (req, res) => {

if (missingAsync.size > 0) {
  console.log('Functions missing async:');
  const sorted = [...missingAsync].sort((a, b) => a.lineNum - b.lineNum);
  for (const item of sorted) {
    console.log(`  Line ${item.lineNum}: ${item.line}`);
  }
} else {
  console.log('All functions with await writeJSON are async!');
}
console.log(`Total missing: ${missingAsync.size}`);
