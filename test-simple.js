const http = require('http');

console.log('Testing server connection...');

const options = {
    hostname: 'localhost',
    port: 7000,
    path: '/health',
    method: 'GET'
};

const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers)}`);
    
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        console.log(`Body: ${chunk}`);
    });
    
    res.on('end', () => {
        console.log('Response ended');
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.end();
