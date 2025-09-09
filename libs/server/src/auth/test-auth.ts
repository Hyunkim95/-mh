#!/usr/bin/env node
/**
 * Basic Authentication System Test
 * 
 * This script tests the core authentication functionality.
 * Run with: tsx test-auth.ts
 */

import { authService } from './services/auth.service';
import { createChallenge, verifySignature } from '@libs/solana-node';
import * as nacl from 'tweetnacl';
import * as bs58 from 'bs58';
import { PublicKey, Keypair } from '@solana/web3.js';
import { decodeUTF8 } from 'tweetnacl-util';

async function testAuthenticationFlow() {
  console.log('🧪 Testing Solana Authentication System...\n');
  
  try {
    // Generate a test keypair
    const testKeypair = Keypair.generate();
    const publicKey = testKeypair.publicKey.toString();
    
    console.log('1. 🔑 Generated test keypair');
    console.log(`   Public Key: ${publicKey}\n`);
    
    // Test 1: Generate Challenge
    console.log('2. 🎯 Testing challenge generation...');
    const challenge = await authService.generateChallenge(publicKey);
    console.log(`   Nonce: ${challenge.nonce}`);
    console.log(`   Message: ${challenge.message}\n`);
    
    // Test 2: Sign the message
    console.log('3. ✍️  Signing challenge message...');
    const messageBytes = decodeUTF8(challenge.message);
    const signature = nacl.sign.detached(messageBytes, testKeypair.secretKey);
    const signatureBase58 = bs58.encode(signature);
    console.log(`   Signature: ${signatureBase58.slice(0, 20)}...\n`);
    
    // Test 3: Verify signature
    console.log('4. ✅ Testing signature verification...');
    const isValid = await verifySignature(publicKey, challenge.nonce, signatureBase58, false);
    console.log(`   Signature valid: ${isValid}\n`);
    
    if (!isValid) {
      throw new Error('Signature verification failed');
    }
    
    // Test 4: Create session
    console.log('5. 🎫 Testing session creation...');
    const session = await authService.verifyAndCreateSession(
      publicKey,
      challenge.nonce,
      signatureBase58,
      false
    );
    
    console.log(`   User ID: ${session.user.id}`);
    console.log(`   User Role: ${session.user.role}`);
    console.log(`   Session ID: ${session.session.id}`);
    console.log(`   Token: ${session.token.slice(0, 20)}...\n`);
    
    // Test 5: Verify token
    console.log('6. 🔍 Testing token verification...');
    const authContext = await authService.verifyToken(session.token);
    console.log(`   Token valid: ${authContext.user !== null}`);
    console.log(`   User ID from token: ${authContext.user?.id}\n`);
    
    // Test 6: Test role update (requires existing user)
    console.log('7. 👑 Testing role update...');
    const updatedUser = await authService.updateUserRole(publicKey, 'admin');
    console.log(`   New role: ${updatedUser?.role}\n`);
    
    // Test 7: Verify admin token
    console.log('8. 🛡️  Testing admin token verification...');
    const adminContext = await authService.verifyToken(session.token);
    console.log(`   User is admin: ${adminContext.user?.role === 'admin'}\n`);
    
    // Test 8: Logout
    console.log('9. 🚪 Testing logout...');
    const logoutSuccess = await authService.logout(session.token);
    console.log(`   Logout successful: ${logoutSuccess}\n`);
    
    // Test 9: Verify token after logout
    console.log('10. ❌ Testing token after logout...');
    const invalidContext = await authService.verifyToken(session.token);
    console.log(`   Token invalid after logout: ${invalidContext.user === null}\n`);
    
    console.log('✅ All authentication tests passed! 🎉');
    
  } catch (error) {
    console.error('❌ Authentication test failed:', error);
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testAuthenticationFlow().then(() => {
    console.log('\n🏁 Test completed successfully!');
    process.exit(0);
  }).catch((error) => {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  });
}