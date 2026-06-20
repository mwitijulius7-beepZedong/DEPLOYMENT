const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

let db = null;
let mongoConnectionPromise = null;
let mongoConnectionFailed = false;
let mongoNextRetry = 0;
const MONGO_RETRY_DELAY = 60000;

async function getMongoDB() {
  if (db) return db;
  const mongoUri = process.env.MONGODB_URI || process.env.PERSONALBLOG_MONGODB_URI;
  if (!mongoUri) return null;
  if (mongoConnectionFailed && Date.now() < mongoNextRetry) return null;
  if (mongoConnectionPromise) return mongoConnectionPromise;
  mongoConnectionPromise = (async () => {
    try {
      const client = await MongoClient.connect(mongoUri, {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
        socketTimeoutMS: 10000
      });
      console.log('Connected to MongoDB');
      db = client.db('blog');
      mongoConnectionFailed = false;
      return db;
    } catch (error) {
      console.error('MongoDB connection error:', error.message);
      mongoConnectionFailed = true;
      mongoNextRetry = Date.now() + MONGO_RETRY_DELAY;
      return null;
    } finally {
      mongoConnectionPromise = null;
    }
  })();
  return mongoConnectionPromise;
}

let kv = null;
function setKV(kvInstance) { kv = kvInstance; }

function isObjectId(id) {
  return typeof id === 'string' && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id);
}

function normalizeDoc(doc) {
  return { ...doc, id: (doc._id || doc.id).toString() };
}

async function loadFromMongo(collectionName, query = {}, transform = normalizeDoc) {
  const mongoDb = await getMongoDB();
  if (!mongoDb) return null;
  try {
    const data = await mongoDb.collection(collectionName).find(query).toArray();
    if (data && data.length > 0) return data.map(transform);
    return [];
  } catch (e) {
    console.warn(`MongoDB ${collectionName} query error:`, e.message);
    return null;
  }
}

async function loadSingleFromMongo(collectionName, filter) {
  const mongoDb = await getMongoDB();
  if (!mongoDb) return null;
  try {
    return await mongoDb.collection(collectionName).findOne(filter);
  } catch (e) {
    console.warn(`MongoDB ${collectionName} findOne error:`, e.message);
    return null;
  }
}

async function loadFromKV(kvKey) {
  if (!process.env.VERCEL || !kv) return null;
  try {
    const data = await kv.get(kvKey);
    if (data) {
      const parsed = JSON.parse(data);
      console.log(`Loaded ${kvKey} from Vercel KV`);
      return parsed;
    }
  } catch (e) {
    console.warn(`KV ${kvKey} error:`, e.message);
  }
  return null;
}

function loadFromFile(filePath, defaultData = []) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn(`Local file ${path.basename(filePath)} error:`, e.message);
  }
  return defaultData;
}

async function saveToMongo(collectionName, data, options = {}) {
  const mongoDb = await getMongoDB();
  if (!mongoDb) return false;
  try {
    const col = mongoDb.collection(collectionName);
    const { typeField } = options;

    if (typeField) {
      await col.updateOne(
        { type: typeField },
        { $set: { data, updatedAt: new Date() } },
        { upsert: true }
      );
      return true;
    }

    if (Array.isArray(data)) {
      if (data.length === 0) {
        await col.deleteMany({});
        return true;
      }
      const ids = [];
      const ops = data.map(item => {
        const { id, ...doc } = item;
        let filterSelector;
        if (isObjectId(id)) {
          const oid = new ObjectId(id);
          ids.push(oid, id);
          filterSelector = { _id: { $in: [oid, id] } };
        } else {
          ids.push(id);
          filterSelector = { _id: id };
        }
        return {
          updateOne: {
            filter: filterSelector,
            update: { $set: { ...doc, id } },
            upsert: true
          }
        };
      });
      await col.bulkWrite(ops, { ordered: false });
      await col.deleteMany({ _id: { $nin: ids } });
      return true;
    }

    return false;
  } catch (e) {
    console.error(`Save to MongoDB ${collectionName} error:`, e.message);
    throw e;
  }
}

async function saveToKV(kvKey, data) {
  if (process.env.VERCEL && kv) {
    await kv.set(kvKey, JSON.stringify(data));
    return true;
  }
  return false;
}

function saveToFile(filePath, data) {
  if (process.env.VERCEL) return false;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return true;
}

async function saveWithFallback(collectionName, kvKey, filePath, data, options = {}) {
  const mongoDb = await getMongoDB();
  if (mongoDb) {
    await saveToMongo(collectionName, data, options);
    return;
  }
  if (await saveToKV(kvKey, data)) return;
  const saved = saveToFile(filePath, data);
  if (!saved && process.env.VERCEL) {
    const hasMongoUri = !!(process.env.MONGODB_URI || process.env.PERSONALBLOG_MONGODB_URI);
    const reason = hasMongoUri ? 'MongoDB connection failed' : 'MONGODB_URI not set';
    console.error(`save ${collectionName}: cannot write on Vercel without storage. Reason: ${reason}`);
    throw new Error(`No writable storage available on Vercel (${reason}). Configure MONGODB_URI.`);
  }
}

async function loadWithFallback({ collectionName, kvKey, filePath, mongoQuery = {}, transform = normalizeDoc, defaultData }) {
  let data = await loadFromMongo(collectionName, mongoQuery, transform);
  if (data !== null && data !== undefined) return data;

  const kvData = await loadFromKV(kvKey);
  if (kvData !== null && kvData !== undefined) {
    return transform && Array.isArray(kvData) ? kvData.map(transform) : kvData;
  }

  return loadFromFile(filePath, defaultData);
}

async function loadWithFallbackSingle({ collectionName, mongoFilter, kvKey, filePath, defaultData }) {
  const mongoResult = await loadSingleFromMongo(collectionName, mongoFilter);
  if (mongoResult !== null && mongoResult !== undefined) return mongoResult;

  const kvData = await loadFromKV(kvKey);
  if (kvData !== null && kvData !== undefined) return kvData;

  return loadFromFile(filePath, defaultData);
}

module.exports = {
  getMongoDB,
  setKV,
  ObjectId,
  isObjectId,
  normalizeDoc,
  loadFromMongo,
  loadSingleFromMongo,
  loadFromKV,
  loadFromFile,
  saveToMongo,
  saveToKV,
  saveToFile,
  saveWithFallback,
  loadWithFallback,
  loadWithFallbackSingle
};
