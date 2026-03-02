const fetch = require('node-fetch');

async function test() {
    const credentials = [
        { u: 'admin', p: 'Mwitijulius7@Jm' },
        { u: 'admin', p: 'password' },
        { u: 'Mwitijulius7', p: 'Mwitijulius7@Jm' }
    ];

    for (const cred of credentials) {
        console.log(`Testing login for ${cred.u} with password ${cred.p}...`);
        try {
            const res = await fetch('http://localhost:3000/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: cred.u, password: cred.p })
            });
            const data = await res.json();
            console.log(`Response: ${res.status}`, data);
        } catch (e) {
            console.error(`Error: ${e.message}`);
        }
    }
}

test();
