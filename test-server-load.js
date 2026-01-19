try {
  console.log('Attempting to load server.js...');
  const server = require('./server.js');
  console.log('✅ Server loaded successfully');
  console.log('Server type:', typeof server);
  console.log('Server keys:', Object.keys(server || {}));
} catch (error) {
  console.log('❌ Failed to load server.js');
  console.log('Error type:', error.constructor.name);
  console.log('Error message:', error.message);
  console.log('Error stack:', error.stack);
}
