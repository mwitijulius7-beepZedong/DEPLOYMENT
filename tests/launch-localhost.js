const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Localhost Server...');

// Start the server
const server = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, PORT: 3000, NODE_ENV: 'development' }
});

// Wait a moment for server to start, then open browser
setTimeout(async () => {
    const url = 'http://localhost:3000/login.html';
    console.log(`\n🌐 Opening ${url} in your default browser...`);
    
    try {
        // Try using the 'open' package if installed
        const open = require('open');
        await open(url);
    } catch (e) {
        // Fallback for different OSs if 'open' package isn't present
        const startCommand = process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open';
        require('child_process').exec(`${startCommand} ${url}`);
    }
    
    console.log('\n✨ Server is running! Press Ctrl+C to stop.');
}, 2000);

// Handle server exit
server.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
});

// Handle script termination
process.on('SIGINT', () => {
    console.log('\nStopping server...');
    server.kill();
    process.exit();
});