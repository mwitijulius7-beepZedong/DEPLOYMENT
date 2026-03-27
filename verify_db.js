const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.PERSONALBLOG_MONGODB_URI || process.env.MONGODB_URI;
if (!uri) {
  console.log("NO_URI");
  process.exit(1);
}

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const database = client.db('blog'); // The server uses 'blog' database
    const posts = database.collection('posts');
    const post = await posts.findOne({ title: /Nairobi|Slow Living/i });
    
    if (post) {
      const result = await posts.deleteOne({ _id: post._id });
      console.log("POST_DELETED", result.deletedCount);
    } else {
      console.log("POST_NOT_FOUND");
    }
  } catch (e) {
    console.log("DB_ERROR", e.message);
  } finally {
    await client.close();
  }
}

run();
