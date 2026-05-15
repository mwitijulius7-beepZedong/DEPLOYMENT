#!/usr/bin/env node
/**
 * Test script to verify the admin key hash in users.json
 * Usage: node test-admin-key.js
 */

const bcrypt = require('bcryptjs');
const fs = require('fs');

async function testAdminKey() {
  try {
    // Load users
    const usersData = fs.readFileSync('users.json', 'utf8');
    const users = JSON.parse(usersData);
    
    console.log('🧪 Testing admin key verification...\n');
    
    const user = users['Mwitijulius7'];
    if (!user) {
      console.error('❌ User "Mwitijulius7" not found in users.json');
      return;
    }
    
    console.log('✅ User found:', user.name);
    console.log('📋 Admin key set:', user.adminKeySet);
    console.log('🔐 Admin key hash:', user.adminKeyHash?.substring(0, 20) + '...');
    
    if (!user.adminKeyHash) {
      console.error('❌ No adminKeyHash found for this user');
      return;
    }
    
    // Test the admin key
    const testKey = 'Mwitijulius7';
    console.log(`\n🔍 Testing if admin key "${testKey}" matches the hash...`);
    
    const matches = await bcrypt.compare(testKey, user.adminKeyHash);
    
    if (matches) {
      console.log('✅ SUCCESS! The admin key "Mwitijulius7" matches the hash.');
      console.log('\nThe /api/settings/verify-entry-key endpoint should accept this key.');
    } else {
      console.log('❌ FAILED! The admin key does NOT match the hash.');
      console.log('The hash was generated from a different password.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAdminKey();
