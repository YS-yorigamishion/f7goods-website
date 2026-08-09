import { readFileSync, writeFileSync } from 'fs';

const filePath = 'C:\\Users\\YShio\\f7goods\\server.js';
let content = readFileSync(filePath, 'utf-8');

// Fix pattern: app.postasync ( or app.putasync ( etc.
// These should be: app.post( ... async (req, res) => {
// But we have: app.postasync (  ... (req, res) => {
// The async needs to move from after method name to before the callback

// Pattern: app.METHODasync ('ROUTE', MIDDLEWARE, (req, res) => {
// Should be: app.METHOD('ROUTE', MIDDLEWARE, async (req, res) => {

let count = 0;
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  const match = lines[i].match(/^(\s*)app\.(get|post|put|delete|use)async\s*\(/);
  if (match) {
    const indent = match[1];
    const method = match[2];
    // Remove "async" from after method name, put "async " before the callback
    let fixed = lines[i].replace(`app.${method}async (`, `app.${method}(`);
    // Now find the callback (last occurrence of (req, ...) => ) and add async
    // The callback is typically: , (req, res) => { or , (req, res, next) => {
    fixed = fixed.replace(/,\s*\((req[^)]*)\)\s*=>/, ', async ($1) =>');
    lines[i] = fixed;
    count++;
  }
}

console.log(`Fixed ${count} broken app.methodasync lines`);
writeFileSync(filePath, lines.join('\n'), 'utf-8');
console.log('File saved.');
