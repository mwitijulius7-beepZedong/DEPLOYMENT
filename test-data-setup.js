require('dotenv').config();
const { MongoClient } = require('mongodb');

async function setupTestData() {
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('blog');

    // Insert test posts
    const posts = [
      {
        id: 1,
        title: 'Test Post 1',
        author: 'Admin',
        content: 'This is test content 1',
        date: new Date().toISOString(),
        tags: ['test', 'blog'],
        image: '',
        featured: false,
        isDraft: false,
        categoryId: null
      },
      {
        id: 2,
        title: 'Test Post 2',
        author: 'Admin',
        content: 'This is test content 2',
        date: new Date().toISOString(),
        tags: ['test', 'tutorial'],
        image: '',
        featured: true,
        isDraft: false,
        categoryId: null
      }
    ];

    await db.collection('posts').insertMany(posts);
    console.log('Inserted test posts');

    // Insert test comments
    const comments = [
      {
        id: 1,
        postId: 1,
        name: 'Test User',
        email: 'test@example.com',
        content: 'Great post!',
        parentId: null,
        date: new Date().toISOString(),
        approved: true
      },
      {
        id: 2,
        postId: 1,
        name: 'Another User',
        email: 'another@example.com',
        content: 'Thanks for sharing',
        parentId: null,
        date: new Date().toISOString(),
        approved: true
      }
    ];

    await db.collection('comments').insertMany(comments);
    console.log('Inserted test comments');

    // Insert test subscriptions
    const subscriptions = [
      {
        id: 1,
        email: 'subscriber1@example.com',
        name: 'Subscriber One',
        postId: null,
        subscribedAt: new Date().toISOString()
      },
      {
        id: 2,
        email: 'subscriber2@example.com',
        name: 'Subscriber Two',
        postId: 1,
        subscribedAt: new Date().toISOString()
      }
    ];

    await db.collection('subscriptions').insertMany(subscriptions);
    console.log('Inserted test subscriptions');

    console.log('Test data setup complete');

  } catch (error) {
    console.error('Error setting up test data:', error);
  } finally {
    await client.close();
  }
}

setupTestData();
