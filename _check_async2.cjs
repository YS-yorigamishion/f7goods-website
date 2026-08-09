const fs = require('fs');
const lines = fs.readFileSync('C:\\Users\\YShio\\f7goods\\server.js', 'utf-8').split('\n');

// Find all lines with await writeJSON
const callLines = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('await writeJSON(')) {
    callLines.push(i);
  }
}

// For each call line, find the TRUE enclosing function (not forEach callbacks)
// Walk backwards tracking brace depth
const enclosingFuncs = new Map(); // lineNum -> line content

for (const callIdx of callLines) {
  let braceDepth = 0;
  let found = false;
  
  for (let i = callIdx - 1; i >= 0; i--) {
    const line = lines[i];
    
    // Count braces on this line
    let opens = 0, closes = 0;
    for (const ch of line) {
      if (ch === '{') opens++;
      if (ch === '}') closes++;
    }
    
    // Before processing this line's function signatures,
    // check if the closing braces bring us out of scope
    braceDepth += closes;
    braceDepth -= opens;
    
    if (braceDepth > 0) {
      // We're inside a sub-block, keep looking
      // But first check if THIS line defines a function
    }
    
    // Pattern: function name(
    if (/^\s*(async\s+)?function\s+\w+\s*\(/.test(line) && braceDepth <= 0) {
      const lineNum = i + 1;
      if (!line.includes('async')) {
        enclosingFuncs.set(lineNum, line.trimEnd());
      }
      found = true;
      break;
    }
    
    // Pattern: app.method('...', callback
    if (/^\s*app\.(get|post|put|delete|use)\s*\(/.test(line) && braceDepth <= 0) {
      const lineNum = i + 1;
      if (!line.includes('async')) {
        // Check if the callback on this or next line has async
        let callbackLine = line;
        if (!line.includes('=>') && !line.includes('function(')) {
          callbackLine = lines[i+1] || '';
        }
        if (!callbackLine.includes('async')) {
          enclosingFuncs.set(lineNum, line.trimEnd());
        }
      }
      found = true;
      break;
    }
    
    // Pattern: const/let/var name = function/arrow
    if (/^\s*(const|let|var)\s+\w+\s*=\s*/.test(line) && braceDepth <= 0) {
      const lineNum = i + 1;
      if (!line.includes('async')) {
        enclosingFuncs.set(lineNum, line.trimEnd());
      }
      found = true;
      break;
    }
  }
}

if (enclosingFuncs.size > 0) {
  console.log('Enclosing functions that need async:');
  const sorted = [...enclosingFuncs.entries()].sort((a, b) => a[0] - b[0]);
  for (const [ln, content] of sorted) {
    console.log(`  Line ${ln}: ${content}`);
  }
} else {
  console.log('All enclosing functions are already async!');
}
console.log(`Total needing async: ${enclosingFuncs.size}`);
