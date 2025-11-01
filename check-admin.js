const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function checkAdminCredentials() {
  const uri = 'mongodb+srv://mwitijulius7_db_user:YjfuPIROdVNXgfxe@maozedong254.7x6uxql.mongodb.net/';

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('blog');
    const usersCollection = db.collection('users');

    // Check all users in the database
    const allUsers = await usersCollection.find({}).toArray();
    console.log('All users in database:', allUsers.map(u => ({ username: u.username, email: u.email })));

    // Check specifically for our admin user
    const adminUser = await usersCollection.findOne({ username: 'Mwitijulius7' });
    if (adminUser) {
      console.log('Admin user found:', {
        username: adminUser.username,
        email: adminUser.email,
        hasPasswordHash: !!adminUser.passwordHash
      });

      // Test password verification
      const testPassword = 'Mwitijulius7@Jm';
      const isValid = await bcrypt.compare(testPassword, adminUser.passwordHash);
      console.log('Password verification test:', isValid ? 'SUCCESS' : 'FAILED');

    } else {
      console.log('Admin user NOT found in database');
    }

  } catch (error) {
    console.error('Error checking admin credentials:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

checkAdminCredentials();
