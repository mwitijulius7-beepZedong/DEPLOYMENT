import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

async function checkAdminCredentials() {
  const uri = 'mongodb+srv://mwitijulius7_db_user:YjfuPIROdVNXgfxe@maozedong254.7x6uxql.mongodb.net/';

  const client = new MongoClient(uri, {
    directConnection: true, // Add this to help with DNS issues on some networks
    serverSelectionTimeoutMS: 5000, // Shorten timeout for quicker feedback
  });

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB successfully.');

    const db = client.db('blog');
    const usersCollection = db.collection('users');

    // Check specifically for our admin user
    const adminUser = await usersCollection.findOne({ username: 'Mwitijulius7' });

    if (adminUser) {
      console.log('✅ Admin user "Mwitijulius7" found in the database.');
      console.log('   - User details:', {
        username: adminUser.username,
        email: adminUser.email,
        hasPasswordHash: !!adminUser.passwordHash
      });

      // Test password verification
      const testPassword = 'Mwitijulius7@Jm';
      const isValid = await bcrypt.compare(testPassword, adminUser.passwordHash);
      
      console.log(`\nVerifying password "${testPassword}"...`);
      console.log(isValid ? '✅ SUCCESS: Password verification passed!' : '❌ FAILED: Password does not match the one in the database.');

    } else {
      console.log('❌ Admin user "Mwitijulius7" was NOT found in the database.');
    }

  } catch (error) {
    console.error('❌ Error during check:', error);
  } finally {
    await client.close();
    console.log('\nDisconnected from MongoDB.');
  }
}

checkAdminCredentials();