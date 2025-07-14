// Quick test to verify server is running
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 7000,
  path: '/manifest.json',
  method: 'GET'
};

console.log('Testing server connection...');

const req = http.request(options, (res) => {
  console.log(`✅ Server is running! Status: ${res.statusCode}`);
  console.log(`Headers:`, res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', data.substring(0, 500));
  });
});

req.on('error', (e) => {
  console.error(`❌ Server not accessible: ${e.message}`);
});

req.setTimeout(5000, () => {
  console.error('❌ Connection timeout');
  req.destroy();
});

req.end();
