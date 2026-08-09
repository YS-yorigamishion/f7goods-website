const fs = require('fs');
let content = fs.readFileSync('C:\\Users\\YShio\\f7goods\\server.js', 'utf-8');

// Fix pattern: app.postasync ( -> app.post(, async (req, res) => {
// Actually the pattern is: app.postasync ('...', ..., (req, res) => {
// Need to become: app.post('...', ..., async (req, res) => {

// Replace app.postasync  with app.post and add async before the callback
// Pattern: app.METHODasync ('ROUTE', ..., (req, res) => {
// Fix: app.METHOD('ROUTE', ..., async (req, res) => {

let fixCount = 0;

// Fix: app.postasync  -> app.post
// Then find the (req, res) => on that line and add async before it
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Match the broken pattern
  const match = line.match(/^(\s*)app\.(get|post|put|delete|use)async\s*\(/);
  if (match) {
    const indent = match[1];
    const method = match[2];
    // Replace the broken method name with the correct one
    let fixed = line.replace(`app.${method}async (`, `app.${method}(`);
    // Now add async before the callback: find the last (req, res) or similar before => {
    // The callback is typically the last argument
    fixed = fixed.replace(/,\s*\((req,\s*res(?:,\s*next)?)\)\s*=>/, ', async ($1) =>');
    lines[i] = fixed;
    fixCount++;
  }
}

console.log(`Fixed ${fixCount} lines`);

fs.writeFileSync('C:\\Users\\YShio\\f7goods\\server.js', lines.join('\n'), 'utf-8');
console.log('File saved.');
