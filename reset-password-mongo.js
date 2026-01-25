const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function resetPassword() {
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

    // User to reset
    const username = 'Mwitijulius7';
    const newPassword = 'Mwitijulius7@Jm';

    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update the user's password
    const result = await usersCollection.updateOne(
      { username: username },
      {
        $set: {
          passwordHash: passwordHash
        }
      }
    );

    if (result.matchedCount === 0) {
      console.log(`❌ User "${username}" not found in database`);
    } else if (result.modifiedCount > 0) {
      console.log(`✅ Password reset successfully for user: ${username}`);
      console.log(`New password: ${newPassword}`);
      console.log(`Password hash: ${passwordHash}`);
    } else {
      console.log('Password already matches (no update needed)');
    }

  } catch (error) {
    console.error('Error resetting password:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

resetPassword();
