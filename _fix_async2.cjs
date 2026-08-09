const fs = require('fs');
let lines = fs.readFileSync('C:\\Users\\YShio\\f7goods\\server.js', 'utf-8').split('\n');

// Strategy: for every `await writeJSON` call, walk upward to find the 
// DIRECT enclosing function definition (app.method handler or named function),
// skipping forEach/map/etc callbacks. If that function is not async, add async.

// Find all lines with await writeJSON
const callLineIndices = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('await writeJSON(')) {
    callLineIndices.push(i);
  }
}

console.log(`Found ${callLineIndices.length} await writeJSON calls`);

const needsAsync = new Map(); // lineIndex -> reason

for (const callIdx of callLineIndices) {
  // Walk backwards from the call line, tracking brace depth
  let braceDepth = 0;
  
  for (let i = callIdx - 1; i >= 0; i--) {
    const line = lines[i];
    
    // Count braces
    for (const ch of line) {
      if (ch === '}') braceDepth++;
      if (ch === '{') braceDepth--;
    }
    
    // We're looking for the first function boundary we cross (braceDepth < 0)
    if (braceDepth < 0) {
      // This line opens a brace that contains our call. Check if it's a function def.
      
      // Pattern 1: function name(...) {
      if (/^\s*(async\s+)?function\s+\w+\s*\(/.test(line)) {
        if (!line.includes('async')) {
          needsAsync.set(i, `function: ${line.trim()}`);
        }
        break;
      }
      
      // Pattern 2: app.method('...', callback) {
      // The app.method line might be the same line or the line before
      const checkLines = [i, i - 1, i - 2];
      let foundApp = false;
      for (const ci of checkLines) {
        if (ci >= 0 && /app\.(get|post|put|delete|use)\s*\(/.test(lines[ci])) {
          if (!lines[ci].includes('async')) {
            // Need to check if the callback itself is already async
            // The callback might be on the same line or a subsequent line
            let callbackHasAsync = false;
            for (let j = ci; j <= ci + 3 && j < lines.length; j++) {
              if (lines[j].includes('async') && (lines[j].includes('=>') || lines[j].includes('function'))) {
                callbackHasAsync = true;
                break;
              }
            }
            if (!callbackHasAsync) {
              needsAsync.set(ci, `app.method: ${lines[ci].trim()}`);
            }
          }
          foundApp = true;
          break;
        }
      }
      if (foundApp) break;
      
      // Pattern 3: const/let/var name = (arrow or function)
      if (/^\s*(const|let|var)\s+\w+\s*=\s*/.test(line)) {
        if (!line.includes('async')) {
          needsAsync.set(i, `assignment: ${line.trim()}`);
        }
        break;
      }
      
      // Pattern 4: forEach/map callback (skip these - the parent needs async)
      if (/\.forEach\(|\.map\(|\.filter\(|\.reduce\(/.test(line)) {
        // Continue looking up for the real enclosing function
        continue;
      }
      
      break;
    }
  }
}

console.log(`\nFunctions needing async:`);
const sorted = [...needsAsync.entries()].sort((a, b) => a[0] - b[0]);
for (const [idx, reason] of sorted) {
  console.log(`  Line ${idx + 1}: ${reason}`);
}

// Now actually apply the fixes
let fixCount = 0;
for (const [idx, reason] of sorted) {
  const line = lines[idx];
  let newLine = line;
  
  if (reason.startsWith('function:')) {
    // Add async before function
    newLine = line.replace(/^(\s*)(function\s+)/, '$1async $2');
  } else if (reason.startsWith('app.method:')) {
    // Add async to the callback - find the => or function(
    // Check if it's an arrow function or regular function
    if (line.includes('=>')) {
      // app.method('...', (req, res) => { or similar
      // Could be multiline. Find the line with =>
      let arrowLine = idx;
      for (let j = idx; j < Math.min(idx + 4, lines.length); j++) {
        if (lines[j].includes('=>')) {
          arrowLine = j;
          break;
        }
      }
      if (arrowLine === idx) {
        // Arrow is on same line
        newLine = line.replace(/(\([^)]*\)\s*=>)/, 'async $1')
                      .replace(/(\w+\s*=>)/, 'async $1');
      } else {
        // Arrow on different line
        lines[arrowLine] = lines[arrowLine].replace(/(\([^)]*\)\s*=>)/, 'async $1')
                                           .replace(/(\w+\s*=>)/, 'async $1');
        console.log(`  Fixed arrow on line ${arrowLine + 1}`);
        continue;
      }
    } else {
      // function(req, res) { pattern
      newLine = line.replace(/(function\s*\()/, 'async $1');
    }
  } else if (reason.startsWith('assignment:')) {
    newLine = line.replace(/(=\s*)(function\s*\()/, '$1async $2')
                  .replace(/(=\s*)(\()/, '$1async $2');
  }
  
  if (newLine !== line) {
    lines[idx] = newLine;
    fixCount++;
    console.log(`  Fixed line ${idx + 1}`);
  } else {
    console.log(`  WARNING: Could not fix line ${idx + 1}: ${line.trim()}`);
  }
}

console.log(`\nApplied ${fixCount} async fixes`);
fs.writeFileSync('C:\\Users\\YShio\\f7goods\\server.js', lines.join('\n'), 'utf-8');
console.log('File saved.');
