import { readFileSync, writeFileSync } from 'fs';

const filePath = 'C:\\Users\\YShio\\f7goods\\server.js';
let lines = readFileSync(filePath, 'utf-8').split('\n');

// Step 1: Add `await` before all writeJSON() calls except the function definition
// Track which lines were modified for reporting
const modifiedLines = [];
const defLineIndex = 183; // 0-based index for line 184

for (let i = 0; i < lines.length; i++) {
  if (i === defLineIndex) continue; // Skip function definition
  
  // Check if this line contains writeJSON( but not already preceded by await
  if (lines[i].includes('writeJSON(')) {
    // Replace writeJSON( with await writeJSON( but only if not already awaited
    const original = lines[i];
    const modified = original.replace(/(?<!await\s)(writeJSON\()/g, 'await $1');
    if (modified !== original) {
      lines[i] = modified;
      modifiedLines.push(i + 1); // 1-based line number
    }
  }
}

console.log(`Added 'await' to ${modifiedLines.length} writeJSON calls`);

// Step 2: Find all functions that now contain 'await writeJSON' and need 'async' added
// We need to find enclosing function for each modified line and ensure it's async

function findEnclosingFunction(lines, targetLine) {
  // Walk backwards from targetLine to find the enclosing function
  // Handles: function name(...) {, const name = (...) => {, app.method('...', (req, res) => {, etc.
  let braceDepth = 0;
  for (let i = targetLine; i >= 0; i--) {
    const line = lines[i];
    
    // Count closing braces from targetLine backwards
    if (i < targetLine) {
      for (let j = line.length - 1; j >= 0; j--) {
        if (line[j] === '}') braceDepth++;
        if (line[j] === '{') braceDepth--;
      }
    }
    
    // Check for function patterns
    // Pattern 1: function name(...) {
    if (/^\s*(async\s+)?function\s+\w+\s*\(/.test(line)) {
      return { lineIndex: i, type: 'function' };
    }
    // Pattern 2: const/let/var name = function( or name = (
    if (/^\s*(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function\s*)?\(/.test(line)) {
      return { lineIndex: i, type: 'assignment' };
    }
    // Pattern 3: app.get/post/put/delete('...', (req, res) => {
    if (/app\.(get|post|put|delete|use)\s*\(/.test(line)) {
      return { lineIndex: i, type: 'app' };
    }
    // Pattern 4: standalone arrow or function passed as callback
    if (/^\s*(async\s+)?\w+\s*\(.*\)\s*{/.test(line) && !line.trim().startsWith('//')) {
      return { lineIndex: i, type: 'other' };
    }
  }
  return null;
}

// For each modified line, find the enclosing function and add async if needed
const asyncAdded = new Set();

for (const modLine of modifiedLines) {
  const idx = modLine - 1; // 0-based
  
  // Walk backwards to find enclosing function
  let braceDepth = 0;
  for (let i = idx; i >= 0; i--) {
    const line = lines[i];
    
    // Track brace depth
    if (i < idx) {
      for (const ch of line) {
        if (ch === '{') braceDepth--;
        if (ch === '}') braceDepth++;
      }
    }
    
    if (braceDepth > 0) break; // We've gone past the function boundary
    
    // Check for function patterns that need async
    // Already async - skip
    if (/async\s/.test(line) && (
      /async\s+function/.test(line) ||
      /=\s*async\s/.test(line) ||
      /async\s*\(/.test(line) ||
      /async\s+\(/.test(line)
    )) {
      break;
    }
    
    // Pattern: function name(
    const funcMatch = line.match(/^(\s*)(function\s+\w+\s*\()/);
    if (funcMatch && !line.includes('async')) {
      lines[i] = line.replace(/^(\s*)(function\s+\w+\s*\()/, '$1async $2');
      asyncAdded.add(i + 1);
      break;
    }
    
    // Pattern: app.method('...', (req, res) => {
    const appMatch = line.match(/(app\.(get|post|put|delete|use)\s*\([^)]*,\s*)((?:\([^)]*\)|\w+)\s*=>\s*{)/);
    if (appMatch && !line.includes('async')) {
      // Check if the callback already has async
      const callbackPart = appMatch[3];
      if (!callbackPart.includes('async')) {
        lines[i] = line.replace(
          /(app\.(get|post|put|delete|use)\s*\([^)]*,\s*)((?:\([^)]*\)|\w+)\s*=>\s*{)/,
          '$1'.includes('=>') ? '$1' : '$1'  // Keep original approach
        );
        // More precise replacement
        const newLine = line.replace(
          /(\(req,\s*res\)\s*=>\s*{)/,
          'async $1'
        ).replace(
          /(\(req,\s*res,\s*next\)\s*=>\s*{)/,
          'async $1'
        );
        if (newLine !== line) {
          lines[i] = newLine;
          asyncAdded.add(i + 1);
        } else {
          // Try another pattern: function(req, res) {
          const newLine2 = line.replace(
            /(function\s*\(req,\s*res\)\s*{)/,
            'async $1'
          );
          if (newLine2 !== line) {
            lines[i] = newLine2;
            asyncAdded.add(i + 1);
          }
        }
      }
      break;
    }
    
    // Pattern: const name = function(
    const assignMatch = line.match(/^(\s*)(const|let|var)\s+(\w+)\s*=\s*(function\s*\()/);
    if (assignMatch && !line.includes('async')) {
      lines[i] = line.replace(
        /^(\s*)((?:const|let|var)\s+\w+\s*=\s*)(function\s*\()/,
        '$1$2async $3'
      );
      asyncAdded.add(i + 1);
      break;
    }
  }
}

console.log(`Added 'async' to ${asyncAdded.size} functions (lines: ${[...asyncAdded].sort((a,b)=>a-b).join(', ')})`);

writeFileSync(filePath, lines.join('\n'), 'utf-8');
console.log('File written successfully');
