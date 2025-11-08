const { MongoClient } = require('mongodb');

async function deleteAllData() {
  const uri = 'mongodb+srv://mwitijulius7_db_user:YjfuPIROdVNXgfxe@maozedong254.7x6uxql.mongodb.net/';

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('blog');

    // Delete all posts
    const postsResult = await db.collection('posts').deleteMany({});
    console.log(`Deleted ${postsResult.deletedCount} posts`);

    // Delete all categories
    const categoriesResult = await db.collection('categories').deleteMany({});
    console.log(`Deleted ${categoriesResult.deletedCount} categories`);

    console.log('All posts and categories have been deleted from production.');

  } catch (error) {
    console.error('Error deleting data:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

deleteAllData();
