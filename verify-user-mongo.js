const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function verifyUser() {
  const uri = 'mongodb+srv://mwitijulius7_db_user:YjfuPIROdVNXgfxe@maozedong254.7x6uxql.mongodb.net/';

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

    // Find the user
    const user = await usersCollection.findOne({ username: 'Mwitijulius7' });

    if (!user) {
      console.log('❌ User "Mwitijulius7" not found in MongoDB');
      return;
    }

    console.log('✅ User found in MongoDB:');
    console.log(`Username: ${user.username}`);
    console.log(`Email: ${user.email}`);
    console.log(`Password Hash: ${user.passwordHash}`);
    console.log(`Name: ${user.name}`);

    // Verify the password
    const testPassword = 'Mwitijulius7@Jm';
    const isValid = await bcrypt.compare(testPassword, user.passwordHash);
    
    if (isValid) {
      console.log(`\n✅ Password verification: SUCCESS`);
      console.log(`Password "${testPassword}" is correct!`);
    } else {
      console.log(`\n❌ Password verification: FAILED`);
      console.log(`Password "${testPassword}" does NOT match the hash`);
    }

  } catch (error) {
    console.error('Error verifying user:', error);
  } finally {
    await client.close();
    console.log('\nDisconnected from MongoDB');
  }
}

verifyUser();
