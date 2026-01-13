const { MongoClient } = require('mongodb');

async function deleteAllPosts() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not found in environment variables');
    return;
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('blog');

    // Delete all posts
    const result = await db.collection('posts').deleteMany({});
    console.log(`Deleted ${result.deletedCount} posts`);

    // Also delete related comments and subscriptions
    const commentsResult = await db.collection('comments').deleteMany({});
    console.log(`Deleted ${commentsResult.deletedCount} comments`);

    const subscriptionsResult = await db.collection('subscriptions').deleteMany({});
    console.log(`Deleted ${subscriptionsResult.deletedCount} subscriptions`);

    console.log('All posts and related data deleted successfully');

  } catch (error) {
    console.error('Error deleting posts:', error);
  } finally {
    await client.close();
  }
}

deleteAllPosts();
