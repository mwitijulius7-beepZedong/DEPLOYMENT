const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function testProductionLogin() {
  const uri = 'mongodb+srv://mwitijulius7_db_user:YjfuPIROdVNXgfxe@maozedong254.7x6uxql.mongodb.net/';

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('blog');
    const usersCollection = db.collection('users');

    // Load users like the server does
    const usersArray = await usersCollection.find({}).toArray();
    const users = {};
    usersArray.forEach(u => users[u.username] = u);

    console.log('Loaded users:', Object.keys(users));

    // Test login with the credentials
    const username = 'Mwitijulius7';
    const password = 'Mwitijulius7@Jm';

    const user = users[username];
    if (!user) {
      console.log('User not found');
      return;
    }

    console.log('User found:', { username: user.username, email: user.email });

    const ok = await bcrypt.compare(password, user.passwordHash);
    console.log('Password verification:', ok ? 'SUCCESS' : 'FAILED');

    if (ok) {
      console.log('Login should work with these credentials');
    } else {
      console.log('Login will fail - password mismatch');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

testProductionLogin();
