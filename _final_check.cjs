const fs = require('fs');
const lines = fs.readFileSync('C:\\Users\\YShio\\f7goods\\server.js', 'utf-8').split('\n');

// 1. Check no writeJSON calls without await (excluding def)
let missingAwait = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (i + 1 === 184) continue; // function definition
  if (line.includes('writeJSON(') && !line.includes('await writeJSON(')) {
    console.log(`MISSING await on line ${i + 1}: ${line.trim()}`);
    missingAwait++;
  }
}

// 2. Check function definition is intact
if (!lines[183].includes('async function writeJSON(file, data)')) {
  console.log('ERROR: writeJSON definition on line 184 is broken!');
} else {
  console.log('OK: writeJSON definition intact on line 184');
}

// 3. Check for any app.methodasync patterns
let brokenAsync = 0;
for (let i = 0; i < lines.length; i++) {
  if (/app\.\w+async/.test(lines[i])) {
    console.log(`BROKEN async on line ${i + 1}: ${lines[i].trim()}`);
    brokenAsync++;
  }
}

// 4. For each await writeJSON, verify enclosing function is async
const callLines = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('await writeJSON(')) callLines.push(i);
}

let notInAsyncFunc = 0;
for (const callIdx of callLines) {
  let braceDepth = 0;
  let foundAsync = false;
  let foundFunc = false;
  
  for (let i = callIdx - 1; i >= 0; i--) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '}') braceDepth++;
      if (ch === '{') braceDepth--;
    }
    if (braceDepth < 0) {
      // Found the enclosing function opening brace
      // Check if it's async
      if (line.includes('async')) {
        foundAsync = true;
      }
      foundFunc = true;
      break;
    }
  }
  
  if (foundFunc && !foundAsync) {
    // Walk up again to find the actual function definition
    braceDepth = 0;
    for (let i = callIdx - 1; i >= 0; i--) {
      const line = lines[i];
      for (const ch of line) {
        if (ch === '}') braceDepth++;
        if (ch === '{') braceDepth--;
      }
      if (braceDepth < 0) {
        // Check: is it a forEach callback? Skip those
        if (/\.forEach\(|\.map\(|\.filter\(/.test(line)) {
          break; // forEach parent doesn't need to be async per se
        }
        if (!line.includes('async')) {
          console.log(`NOT ASYNC at line ${i + 1}: ${line.trim()} (call at line ${callIdx + 1})`);
          notInAsyncFunc++;
        }
        break;
      }
    }
  }
}

console.log(`\nResults:`);
console.log(`  Missing await: ${missingAwait}`);
console.log(`  Broken async patterns: ${brokenAsync}`);
console.log(`  Not in async function: ${notInAsyncFunc}`);
console.log(`  Total await writeJSON calls: ${callLines.length}`);
console.log(missingAwait === 0 && brokenAsync === 0 && notInAsyncFunc === 0 ? 'ALL CHECKS PASSED' : 'ISSUES FOUND');
