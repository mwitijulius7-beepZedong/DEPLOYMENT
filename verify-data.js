const { MongoClient } = require('mongodb');

async function verifyData() {
  const uri = 'mongodb+srv://mwitijulius7_db_user:YjfuPIROdVNXgfxe@maozedong254.7x6uxql.mongodb.net/';

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('blog');

    // Count posts
    const postsCount = await db.collection('posts').countDocuments();
    console.log(`Current posts count: ${postsCount}`);

    // Count categories
    const categoriesCount = await db.collection('categories').countDocuments();
    console.log(`Current categories count: ${categoriesCount}`);

    if (postsCount === 0 && categoriesCount === 0) {
      console.log('Verification successful: All posts and categories have been deleted.');
    } else {
      console.log('Verification failed: Some data still exists.');
    }

  } catch (error) {
    console.error('Error verifying data:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

verifyData();
