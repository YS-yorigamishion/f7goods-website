const fs = require('fs');
const lines = fs.readFileSync('C:\\Users\\YShio\\f7goods\\server.js', 'utf-8').split('\n');

// Find await writeJSON inside non-async arrow callbacks (forEach, map, etc.)
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('await writeJSON(')) {
    // Walk upward to find enclosing function
    let braceDepth = 0;
    for (let j = i - 1; j >= 0; j--) {
      const line = lines[j];
      for (const ch of line) {
        if (ch === '}') braceDepth++;
        if (ch === '{') braceDepth--;
      }
      if (braceDepth < 0) {
        // This line opens the enclosing block
        if (/\.\s*(forEach|map|filter|reduce|some|every|find)\s*\(/.test(line) && !line.includes('async')) {
          console.log(`Line ${j+1}: await writeJSON in non-async ${line.match(/\.\s*(forEach|map|filter|reduce|some|every|find)/)?.[1]} callback (call at line ${i+1})`);
          console.log(`  ${line.trim()}`);
        }
        break;
      }
    }
  }
}
console.log('Done');
