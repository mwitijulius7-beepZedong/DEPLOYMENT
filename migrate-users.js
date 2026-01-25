const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function migrateUsers() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI environment variable is not set');
    process.exit(1);
  }

  let client;
  try {
    console.log('Connecting to MongoDB...');
    client = await MongoClient.connect(MONGODB_URI, {
      ssl: true,
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false
    });
    const db = client.db('blog');

    // Check if users already exist in MongoDB
    const existingUsers = await db.collection('users').find({}).toArray();
    if (existingUsers.length > 0) {
      console.log(`Found ${existingUsers.length} existing users in MongoDB. Skipping migration.`);
      return;
    }

    // Load users from users.json
    const usersFile = path.join(__dirname, 'users.json');
    if (!fs.existsSync(usersFile)) {
      console.error('users.json file not found');
      process.exit(1);
    }

    const usersData = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    console.log(`Found ${Object.keys(usersData).length} users in users.json`);

    // Convert to MongoDB format
    const userArray = Object.entries(usersData).map(([username, userData]) => ({
      username,
      name: userData.name || '',
      email: userData.email || '',
      passwordHash: userData.passwordHash || ''
    }));

    console.log('Users to migrate:', userArray.map(u => ({ username: u.username, email: u.email })));

    // Insert users into MongoDB
    if (userArray.length > 0) {
      const result = await db.collection('users').insertMany(userArray);
      console.log(`Successfully migrated ${result.insertedCount} users to MongoDB`);
    } else {
      console.log('No users to migrate');
    }

  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('MongoDB connection closed');
    }
  }
}

migrateUsers().then(() => {
  console.log('Migration completed successfully');
}).catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
