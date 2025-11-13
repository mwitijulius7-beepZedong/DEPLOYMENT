import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

async function updateAdminCredentials() {
  const uri = 'mongodb+srv://mwitijulius7_db_user:YjfuPIROdVNXgfxe@maozedong254.7x6uxql.mongodb.net/blog?retryWrites=true&w=majority';
  
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000, // Shorten timeout for quicker feedback
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
