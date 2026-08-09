const fs = require('fs');
const lines = fs.readFileSync('C:\\Users\\YShio\\f7goods\\server.js', 'utf-8').split('\n');

// For each await writeJSON, find the TRUE enclosing function by walking up
// and tracking brace depth properly, skipping through try/if/for blocks

const callLineIndices = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('await writeJSON(')) callLineIndices.push(i);
}

const missingAsync = [];

for (const callIdx of callLineIndices) {
  // Walk backward, tracking total brace depth
  let braceDepth = 0;
  
  for (let i = callIdx - 1; i >= 0; i--) {
    const line = lines[i];
    
    // Count ALL braces on this line (not just at boundary)
    let lineOpen = 0, lineClose = 0;
    for (const ch of line) {
      if (ch === '{') lineOpen++;
      if (ch === '}') lineClose++;
    }
    
    braceDepth += lineClose;
    
    // If this line opens a brace that encompasses our call, check if it's a function
    if (braceDepth - lineOpen < 0) {
      // This line has an opening brace that is the enclosing scope
      // Check if it's a function definition or an app.method handler
      
      // Named function: function name(...) {
      if (/^\s*(async\s+)?function\s+\w+/.test(line)) {
        if (!line.includes('async')) {
          missingAsync.push({ line: i + 1, content: line.trim(), type: 'function' });
        }
        break;
      }
      
      // Check if it's a try/if/for/while block - skip to find the real function
      if (/^\s*(try|catch|finally|if|else|for|while|switch)\s*[\s({]/.test(line.trimStart())) {
        braceDepth -= lineOpen;
        continue; // Keep looking upward
      }
      
      // Also check if the opening brace is from try/if/for
      if (/try\s*\{/.test(line) || /if\s*\(/.test(line) || /for\s*\(/.test(line) || /else\s*\{/.test(line)) {
        braceDepth -= lineOpen;
        continue;
      }
      
      // app.method('route', callback) - the callback arrow/function might be on this line
      // or the line might BE the arrow function
      if (/\)\s*=>\s*\{/.test(line) || /function\s*\([^)]*\)\s*\{/.test(line)) {
        // Find the app.method line
        let foundApp = false;
        for (let j = i; j >= Math.max(0, i - 5); j--) {
          if (/app\.(get|post|put|delete|use)\s*\(/.test(lines[j])) {
            if (!lines[j].includes('async') && !line.includes('async')) {
              missingAsync.push({ line: j + 1, content: lines[j].trim(), type: 'app.method' });
            }
            foundApp = true;
            break;
          }
        }
        if (foundApp) break;
        // Standalone arrow/function
        if (!line.includes('async')) {
          missingAsync.push({ line: i + 1, content: line.trim(), type: 'callback' });
        }
        break;
      }
      
      // Check surrounding lines for app.method
      let foundApp = false;
      for (let j = i; j >= Math.max(0, i - 5); j--) {
        if (/app\.(get|post|put|delete|use)\s*\(/.test(lines[j])) {
          if (!lines[j].includes('async')) {
            missingAsync.push({ line: j + 1, content: lines[j].trim(), type: 'app.method' });
          }
          foundApp = true;
          break;
        }
      }
      if (foundApp) break;
      
      // Named variable function
      if (/^\s*(const|let|var)\s+\w+\s*=/.test(line)) {
        if (!line.includes('async')) {
          missingAsync.push({ line: i + 1, content: line.trim(), type: 'assignment' });
        }
        break;
      }
      
      break;
    }
    
    braceDepth -= lineOpen;
  }
}

console.log(`Found ${missingAsync.length} functions still missing async:`);
const unique = [...new Map(missingAsync.map(m => [m.line, m])).values()].sort((a, b) => a.line - b.line);
for (const m of unique) {
  console.log(`  Line ${m.line} (${m.type}): ${m.content}`);
}
