const http = require('http');

function apiRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Login
  const loginResult = await apiRequest('POST', '/api/admin/login', {
    username: 'admin',
    password: 'f7goods2026'
  });
  console.log('Login result:', loginResult);
  const token = loginResult.token;

  // Get events
  const events = await apiRequest('GET', '/api/admin/events', null, token);
  console.log('\nEvents:');
  events.forEach(e => {
    console.log(`  ${e.id}: ${e.title} - relatedWorks: ${JSON.stringify(e.relatedWorks)}`);
  });

  // Get works
  const works = await apiRequest('GET', '/api/admin/works', null, token);
  console.log('\nWorks:');
  works.forEach(w => {
    console.log(`  ${w.id}: ${w.title}`);
  });

  // Try to remove a work from event e001
  const event = events.find(e => e.id === 'e001');
  if (event && event.relatedWorks.length > 0) {
    const workToRemove = event.relatedWorks[0];
    console.log(`\nTrying to remove work ${workToRemove} from event ${event.id}...`);
    console.log('Current relatedWorks:', event.relatedWorks);
    
    const updatedRelatedWorks = event.relatedWorks.filter(id => id !== workToRemove);
    console.log('Updated relatedWorks:', updatedRelatedWorks);
    
    const result = await apiRequest('PUT', `/api/admin/events/${event.id}`, {
      ...event,
      relatedWorks: updatedRelatedWorks
    }, token);
    console.log('Update result:', result);
    
    // Verify
    const updatedEvents = await apiRequest('GET', '/api/admin/events', null, token);
    const updatedEvent = updatedEvents.find(e => e.id === 'e001');
    console.log('Verified relatedWorks:', updatedEvent.relatedWorks);
  }
}

main().catch(console.error);
