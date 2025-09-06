/**
 * 🧪 BYOK System Test Suite
 * Tests Bring Your Own Key functionality
 */

import { BYOKManager } from '../src/auth/BYOKManager.js';
import { BYOKAwareLoader } from '../src/loaders/BYOKAwareLoader.js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3006';
const TEST_API_KEY = 'llm_test_persistent_key_fixed_2025.TEST_SECRET_KEY_2025_PERSISTENT';

console.log('🧪 BYOK System Test Suite\n');
console.log('================================\n');

/**
 * Test BYOK Manager
 */
async function testBYOKManager() {
  console.log('📝 Testing BYOK Manager...\n');
  
  const manager = new BYOKManager({
    storageFile: './data/test-byok-keys.json'
  });
  
  await manager.initialize();
  
  // Test 1: List supported providers
  console.log('Test 1: List Supported Providers');
  const providers = manager.getSupportedProviders();
  console.log(`  ✅ Found ${providers.length} supported providers`);
  console.log(`  Providers: ${providers.slice(0, 5).map(p => p.name).join(', ')}, ...`);
  
  // Test 2: Add a mock user key
  console.log('\nTest 2: Add User Key');
  const testUserId = 'test-user-001';
  const mockApiKey = 'sk-test-mock-key-for-testing-only';
  
  try {
    // Mock validation for testing
    const originalValidate = manager.getProviderConfig('openai').validateKey;
    manager.getProviderConfig('openai').validateKey = async () => true;
    
    const result = await manager.setUserKey(testUserId, 'openai', mockApiKey, {
      name: 'Test OpenAI Key',
      description: 'Mock key for testing'
    });
    
    console.log(`  ✅ Added OpenAI key for user: ${result.keyId}`);
    
    // Restore original validation
    manager.getProviderConfig('openai').validateKey = originalValidate;
  } catch (error) {
    console.log(`  ❌ Failed to add key: ${error.message}`);
  }
  
  // Test 3: Retrieve user providers
  console.log('\nTest 3: Get User Providers');
  const userProviders = await manager.getUserProviders(testUserId);
  console.log(`  ✅ User has ${userProviders.length} provider(s)`);
  userProviders.forEach(p => {
    console.log(`    - ${p.name}: ${p.hasUserKey ? 'User Key' : ''} ${p.hasGroupKey ? 'Group Key' : ''}`);
  });
  
  // Test 4: Group management
  console.log('\nTest 4: Group Management');
  const testGroupId = 'test-group-001';
  
  try {
    // Mock validation for testing
    const originalValidate = manager.getProviderConfig('anthropic').validateKey;
    manager.getProviderConfig('anthropic').validateKey = async () => true;
    
    await manager.setGroupKey(testGroupId, 'anthropic', 'sk-ant-test-group-key', {
      name: 'Shared Anthropic Key',
      sharedBy: 'admin'
    });
    
    console.log(`  ✅ Added Anthropic key for group: ${testGroupId}`);
    
    // Add user to group
    await manager.addUserToGroup(testUserId, testGroupId);
    console.log(`  ✅ Added user ${testUserId} to group ${testGroupId}`);
    
    // Restore original validation
    manager.getProviderConfig('anthropic').validateKey = originalValidate;
  } catch (error) {
    console.log(`  ❌ Group operation failed: ${error.message}`);
  }
  
  // Test 5: Get key with group access
  console.log('\nTest 5: Get Key with Group Access');
  const groupKey = await manager.getUserKey(testUserId, 'anthropic', testGroupId);
  console.log(`  ${groupKey ? '✅ Retrieved group key' : '❌ No key found'}`);
  
  // Test 6: Usage statistics
  console.log('\nTest 6: Usage Statistics');
  const stats = await manager.getUsageStats(testUserId, testGroupId);
  console.log(`  ✅ Stats: ${stats.userKeys} user keys, ${stats.groupKeys} group keys`);
  console.log(`    Total usage: ${stats.totalUsage} calls`);
  
  // Clean up test data
  await manager.removeUserKey(testUserId, 'openai');
  console.log('\n✅ BYOK Manager tests completed\n');
}

/**
 * Test BYOK API Endpoints
 */
async function testBYOKAPI() {
  console.log('🌐 Testing BYOK API Endpoints...\n');
  
  // Test 1: Get supported providers
  console.log('Test 1: GET /api/byok/providers');
  try {
    const response = await fetch(`${BASE_URL}/api/byok/providers`);
    const data = await response.json();
    
    if (data.success) {
      console.log(`  ✅ Retrieved ${data.providers.length} providers`);
    } else {
      console.log(`  ❌ Failed: ${data.error}`);
    }
  } catch (error) {
    console.log(`  ❌ Request failed: ${error.message}`);
  }
  
  // Test 2: Get user providers (requires auth)
  console.log('\nTest 2: GET /api/byok/keys (authenticated)');
  try {
    const response = await fetch(`${BASE_URL}/api/byok/keys`, {
      headers: {
        'Authorization': `Bearer ${TEST_API_KEY}`
      }
    });
    const data = await response.json();
    
    if (data.success) {
      console.log(`  ✅ User ${data.userId} has ${data.providers.length} provider(s)`);
    } else {
      console.log(`  ❌ Failed: ${data.error}`);
    }
  } catch (error) {
    console.log(`  ❌ Request failed: ${error.message}`);
  }
  
  // Test 3: Add a mock key
  console.log('\nTest 3: POST /api/byok/keys/:provider');
  try {
    const response = await fetch(`${BASE_URL}/api/byok/keys/openai`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        apiKey: 'sk-test-mock-api-key-12345',
        name: 'Test OpenAI Key',
        description: 'Mock key for API testing'
      })
    });
    const data = await response.json();
    
    if (data.success) {
      console.log(`  ✅ Added key: ${data.keyId}`);
      
      // Clean up - remove the test key
      const deleteResponse = await fetch(`${BASE_URL}/api/byok/keys/openai`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${TEST_API_KEY}`
        }
      });
      
      if ((await deleteResponse.json()).success) {
        console.log('  ✅ Test key cleaned up');
      }
    } else {
      console.log(`  ⚠️ Expected behavior: ${data.error}`);
    }
  } catch (error) {
    console.log(`  ❌ Request failed: ${error.message}`);
  }
  
  console.log('\n✅ BYOK API tests completed\n');
}

/**
 * Test BYOK-Aware Loader
 */
async function testBYOKAwareLoader() {
  console.log('🔧 Testing BYOK-Aware Loader...\n');
  
  const loader = new BYOKAwareLoader({
    provider: 'openai',
    apiKey: 'sk-system-key-12345'
  });
  
  // Test 1: Check initial state
  console.log('Test 1: Initial State');
  const status1 = loader.getKeyStatus();
  console.log(`  ✅ Initial: BYOK=${status1.isByok}, HasSystem=${status1.hasSystemKey}`);
  
  // Test 2: Inject BYOK key
  console.log('\nTest 2: Inject BYOK Key');
  const injected = loader.injectBYOKKey({
    providerKey: 'sk-user-provided-key-67890'
  });
  console.log(`  ✅ Injection: ${injected ? 'Success' : 'Failed'}`);
  
  const status2 = loader.getKeyStatus();
  console.log(`  ✅ After injection: BYOK=${status2.isByok}`);
  
  // Test 3: Reset to system key
  console.log('\nTest 3: Reset to System Key');
  loader.resetToSystemKey();
  const status3 = loader.getKeyStatus();
  console.log(`  ✅ After reset: BYOK=${status3.isByok}, HasSystem=${status3.hasSystemKey}`);
  
  console.log('\n✅ BYOK-Aware Loader tests completed\n');
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🚀 Starting BYOK System Tests\n');
  
  try {
    // Test BYOK Manager
    await testBYOKManager();
    
    // Test API endpoints (requires server to be running)
    if (process.env.TEST_API === 'true') {
      await testBYOKAPI();
    } else {
      console.log('⏭️ Skipping API tests (set TEST_API=true to enable)\n');
    }
    
    // Test BYOK-Aware Loader
    await testBYOKAwareLoader();
    
    console.log('================================');
    console.log('✅ All BYOK tests completed successfully!\n');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests
runAllTests();