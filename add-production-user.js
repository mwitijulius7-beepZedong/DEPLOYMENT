const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function addProductionUser() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI environment variable is not set');
    process.exit(1);
  }

  let client;
  try {
    console.log('Connecting to MongoDB...');
    client = await MongoClient.connect(MONGODB_URI);
    const db = client.db('blog');

    // Check existing users
    const existingUsers = await db.collection('users').find({}).toArray();
    console.log('Existing users:', existingUsers.map(u => u.username));

    // Check if Mwitijulius7 already exists
    const existingUser = existingUsers.find(u => u.username === 'Mwitijulius7');
    if (existingUser) {
      console.log('User Mwitijulius7 already exists in production');
      return;
    }

    // Hash the password
    const password = 'Mwitijulius7@Jm';
    const passwordHash = await bcrypt.hash(password, 10);

    // Add the user
    const newUser = {
      username: 'Mwitijulius7',
      name: 'Admin',
      email: 'admin@example.com',
      passwordHash: passwordHash
    };

    const result = await db.collection('users').insertOne(newUser);
    console.log('Added user Mwitijulius7 to production database');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('MongoDB connection closed');
    }
  }
}

addProductionUser();
