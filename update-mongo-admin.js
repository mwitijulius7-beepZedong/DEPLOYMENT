const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function updateAdminCredentials() {
  // Use environment variables for sensitive information
  const dbUser = process.env.DB_USER;
  const dbPassword = process.env.DB_PASSWORD;
  const dbHost = process.env.DB_HOST || 'maozedong254.7x6uxql.mongodb.net'; // Fallback to default if not set
  const dbName = process.env.DB_NAME || 'blog';

  const uri = `mongodb+srv://${dbUser}:${dbPassword}@${dbHost}/`;
  
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('blog');
    const usersCollection = db.collection('users');

    // New admin credentials
    const username = 'Mwitijulius7';
    const password = 'Mwitijulius7@Jm';
    const name = 'Mwitijulius7';
    const email = 'mwitijulius7@gmail.com';

    if (!username || !password || !email) {
      throw new Error('Missing admin credentials. Ensure username, password, and email are set.');
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update or insert the admin user
    const result = await usersCollection.updateOne(
      { username: username },
      {
        $set: {
          username: username,
          name: name,
          email: email,
          passwordHash: passwordHash
        }
      },
          { upsert: true }
    );

    if (result.upsertedCount > 0) {
      console.log('New admin user created');
    } else if (result.modifiedCount > 0) {
      console.log('Admin user updated');
    } else {
      console.log('Admin user already exists with same credentials');
    }

    console.log('Admin credentials updated successfully:');
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
    console.log(`Email: ${email}`);
    console.log(`Password Hash: ${passwordHash}`);
  
  } catch (error) {
    console.error('Error updating admin credentials:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

updateAdminCredentials().catch(console.error);
