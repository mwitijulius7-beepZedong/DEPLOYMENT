const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
    const uri = process.env.PERSONALBLOG_MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI not found');
        return;
    }
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('blog');
        const users = await db.collection('users').find().toArray();
        console.log('Users in MongoDB:', users.length);
        users.forEach(u => {
            console.log(`- ${u.username} (Email: ${u.email}, Role: ${u.role})`);
        });
    } catch (err) {
        console.error('Mongo Error:', err.message);
    } finally {
        await client.close();
    }
}

run();
