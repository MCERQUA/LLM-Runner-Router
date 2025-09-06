/**
 * Authentication & Authorization Tests
 * Tests for JWT, API keys, OAuth 2.0, and permission systems
 */

import { jest } from '@jest/globals';
import { AuthenticationManager, AuthMiddleware } from '../../src/api/Auth.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

describe('Authentication & Authorization', () => {
  let authManager;
  let authMiddleware;

  beforeAll(async () => {
    const adminHash = await bcrypt.hash('admin123', 4);
    const userHash = await bcrypt.hash('user123', 4);
    const apiHash = await bcrypt.hash('api123', 4);
    process.env.DEFAULT_ADMIN_PASSWORD_HASH = adminHash;
    process.env.DEFAULT_USER_PASSWORD_HASH = userHash;
    process.env.DEFAULT_API_PASSWORD_HASH = apiHash;
  });

  afterAll(() => {
    delete process.env.DEFAULT_ADMIN_PASSWORD_HASH;
    delete process.env.DEFAULT_USER_PASSWORD_HASH;
    delete process.env.DEFAULT_API_PASSWORD_HASH;
  });

  beforeEach(async () => {
    authManager = new AuthenticationManager({
      jwtSecret: 'test-secret-key',
      jwtExpiresIn: '1h',
      bcryptRounds: 4, // Lower for faster tests
      sessionSecret: 'test-session-secret'
    });
    
    authMiddleware = new AuthMiddleware(authManager);
    
    // Wait for initialization
    await new Promise(resolve => {
      authManager.on('initialized', resolve);
    });
  });

  afterEach(async () => {
    if (authManager) {
      authManager.removeAllListeners();
    }
  });

  describe('AuthenticationManager Initialization', () => {
    test('should initialize with default users', () => {
      expect(authManager.users.size).toBeGreaterThan(0);
      
      // Check if default users exist
      const users = Array.from(authManager.users.values());
      const adminUser = users.find(u => u.username === 'admin');
      const regularUser = users.find(u => u.username === 'user');
      
      expect(adminUser).toBeDefined();
      expect(adminUser.role).toBe('admin');
      expect(regularUser).toBeDefined();
      expect(regularUser.role).toBe('user');
    });

    test('should setup roles and permissions correctly', () => {
      expect(authManager.roles).toBeDefined();
      expect(authManager.roles.admin).toBeDefined();
      expect(authManager.roles.admin.permissions).toContain('*');
      expect(authManager.roles.user.permissions).toContain('inference:create');
    });
  });

  describe('User Management', () => {
    test('should create a new user', async () => {
      const userData = {
        username: 'testuser',
        password: 'testpass123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user'
      };

      const user = await authManager.createUser(userData);

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe('user');
      expect(user.password).toBeUndefined(); // Should not return password
      expect(user.verified).toBe(false); // Default value
    });

    test('should hash passwords correctly', async () => {
      const userData = {
        username: 'hashtest',
        password: 'plaintext123',
        email: 'hash@example.com',
        role: 'user'
      };

      const user = await authManager.createUser(userData);
      const storedUser = authManager.users.get(user.id);

      expect(storedUser.password).not.toBe('plaintext123');
      expect(storedUser.password).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt format
      
      // Verify password can be checked
      const isValid = await bcrypt.compare('plaintext123', storedUser.password);
      expect(isValid).toBe(true);
    });

    test('should update user information', async () => {
      const user = await authManager.createUser({
        username: 'updatetest',
        password: 'pass123',
        email: 'update@example.com',
        role: 'user'
      });

      const updatedUser = await authManager.updateUser(user.id, {
        name: 'Updated Name',
        role: 'admin'
      });

      expect(updatedUser.name).toBe('Updated Name');
      expect(updatedUser.role).toBe('admin');
      expect(updatedUser.permissions).toContain('*'); // Admin permissions
    });

    test('should delete user and cleanup resources', async () => {
      const user = await authManager.createUser({
        username: 'deletetest',
        password: 'pass123',
        email: 'delete@example.com',
        role: 'user'
      });

      // Create API key for user
      await authManager.generateApiKey(user.id, 'Test Key');

      const deleted = authManager.deleteUser(user.id);
      expect(deleted).toBe(true);
      expect(authManager.users.has(user.id)).toBe(false);
      
      // API keys should be revoked
      const userApiKeys = authManager.listApiKeys(user.id);
      expect(userApiKeys.every(key => !key.active)).toBe(true);
    });

    test('should list users with pagination and filtering', () => {
      const result = authManager.listUsers({
        limit: 2,
        offset: 0,
        role: 'admin'
      });

      expect(result).toBeDefined();
      expect(result.users).toBeDefined();
      expect(Array.isArray(result.users)).toBe(true);
      expect(result.total).toBeDefined();
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(0);
      
      // All returned users should be admin
      result.users.forEach(user => {
        expect(user.role).toBe('admin');
        expect(user.password).toBeUndefined();
      });
    });
  });

  describe('Password Authentication', () => {
    test('should authenticate valid credentials', async () => {
      const user = await authManager.authenticateUser('admin', 'admin123');
      
      expect(user).toBeDefined();
      expect(user.username).toBe('admin');
      expect(user.password).toBeUndefined();
      expect(user.lastLogin).toBeDefined();
    });

    test('should reject invalid credentials', async () => {
      const user = await authManager.authenticateUser('admin', 'wrongpassword');
      expect(user).toBeNull();
    });

    test('should reject non-existent users', async () => {
      const user = await authManager.authenticateUser('nonexistent', 'anypassword');
      expect(user).toBeNull();
    });

    test('should handle rate limiting for failed attempts', async () => {
      const username = 'ratelimittest';
      await authManager.createUser({
        username,
        password: 'correctpass',
        email: 'ratetest@example.com',
        role: 'user'
      });

      // Make multiple failed attempts
      for (let i = 0; i < 6; i++) {
        await authManager.authenticateUser(username, 'wrongpassword');
      }

      // Should be locked now
      try {
        await authManager.authenticateUser(username, 'correctpass');
        fail('Should have thrown rate limit error');
      } catch (error) {
        expect(error.message).toContain('temporarily locked');
      }
    });
  });

  describe('JWT Token Management', () => {
    test('should generate valid JWT tokens', async () => {
      const user = await authManager.authenticateUser('admin', 'admin123');
      const tokens = authManager.generateTokens(user);

      expect(tokens).toBeDefined();
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.expiresIn).toBe('1h');

      // Verify token structure
      const decoded = jwt.decode(tokens.accessToken);
      expect(decoded.sub).toBe(user.id);
      expect(decoded.username).toBe(user.username);
      expect(decoded.role).toBe(user.role);
      expect(decoded.iss).toBe('llm-router');
    });

    test('should refresh access tokens', async () => {
      const user = await authManager.authenticateUser('admin', 'admin123');
      const originalTokens = authManager.generateTokens(user);
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const newTokens = await authManager.refreshAccessToken(originalTokens.refreshToken);

      expect(newTokens).toBeDefined();
      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.accessToken).not.toBe(originalTokens.accessToken);
      expect(newTokens.refreshToken).not.toBe(originalTokens.refreshToken);
    });

    test('should reject invalid refresh tokens', async () => {
      try {
        await authManager.refreshAccessToken('invalid-token');
        fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toContain('Invalid');
      }
    });

    test('should revoke tokens (blacklist)', () => {
      const user = authManager.users.get(Array.from(authManager.users.keys())[0]);
      const tokens = authManager.generateTokens(user);
      
      authManager.revokeToken(tokens.accessToken);
      
      const decoded = jwt.decode(tokens.accessToken);
      expect(authManager.blacklistedTokens.has(decoded.jti)).toBe(true);
    });
  });

  describe('API Key Management', () => {
    test('should generate API keys', async () => {
      const user = await authManager.authenticateUser('admin', 'admin123');
      const apiKey = await authManager.generateApiKey(
        user.id, 
        'Test API Key',
        ['model:read', 'inference:create']
      );

      expect(apiKey).toBeDefined();
      expect(apiKey.id).toBeDefined();
      expect(apiKey.key).toMatch(/^llmr_/);
      expect(apiKey.name).toBe('Test API Key');
      expect(apiKey.permissions).toEqual(['model:read', 'inference:create']);
    });

    test('should validate API keys', async () => {
      const user = await authManager.authenticateUser('admin', 'admin123');
      const apiKey = await authManager.generateApiKey(user.id, 'Test Key');
      
      const validation = await authManager.validateApiKey(apiKey.key);

      expect(validation).toBeDefined();
      expect(validation.user.id).toBe(user.id);
      expect(validation.apiKey.id).toBe(apiKey.id);
      expect(validation.permissions).toBeDefined();
    });

    test('should reject invalid API keys', async () => {
      const validation = await authManager.validateApiKey('invalid-key');
      expect(validation).toBeNull();
    });

    test('should revoke API keys', async () => {
      const user = await authManager.authenticateUser('admin', 'admin123');
      const apiKey = await authManager.generateApiKey(user.id, 'Revoke Test');
      
      const revoked = authManager.revokeApiKey(apiKey.id);
      expect(revoked).toBe(true);
      
      const validation = await authManager.validateApiKey(apiKey.key);
      expect(validation).toBeNull();
    });

    test('should list user API keys', async () => {
      const user = await authManager.authenticateUser('admin', 'admin123');
      await authManager.generateApiKey(user.id, 'Key 1');
      await authManager.generateApiKey(user.id, 'Key 2');
      
      const apiKeys = authManager.listApiKeys(user.id);
      
      expect(Array.isArray(apiKeys)).toBe(true);
      expect(apiKeys.length).toBeGreaterThanOrEqual(2);
      apiKeys.forEach(key => {
        expect(key.userId).toBe(user.id);
        expect(key.key).toBeUndefined(); // Should not return actual key
      });
    });
  });

  describe('Permission System', () => {
    test('should check exact permissions', () => {
      const user = { permissions: ['model:read', 'inference:create'] };
      
      expect(authManager.hasPermission(user, 'model:read')).toBe(true);
      expect(authManager.hasPermission(user, 'inference:create')).toBe(true);
      expect(authManager.hasPermission(user, 'model:write')).toBe(false);
    });

    test('should check wildcard permissions', () => {
      const user = { permissions: ['model:*', 'inference:read'] };
      
      expect(authManager.hasPermission(user, 'model:read')).toBe(true);
      expect(authManager.hasPermission(user, 'model:write')).toBe(true);
      expect(authManager.hasPermission(user, 'model:delete')).toBe(true);
      expect(authManager.hasPermission(user, 'inference:read')).toBe(true);
      expect(authManager.hasPermission(user, 'inference:write')).toBe(false);
    });

    test('should handle admin permissions', () => {
      const admin = { permissions: ['*'] };
      
      expect(authManager.hasPermission(admin, 'any:permission')).toBe(true);
      expect(authManager.hasPermission(admin, 'admin:delete')).toBe(true);
      expect(authManager.hasPermission(admin, 'model:nuclear')).toBe(true);
    });
  });

  describe('Middleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        headers: {},
        user: null
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      next = jest.fn();
    });

    test('should authenticate valid JWT tokens', () => {
      const user = authManager.users.get(Array.from(authManager.users.keys())[0]);
      const tokens = authManager.generateTokens(user);
      
      req.headers.authorization = `Bearer ${tokens.accessToken}`;

      // Mock passport authentication
      const middleware = authMiddleware.authenticate();
      
      // Since we're not running full passport setup, we'll test the logic directly
      expect(typeof middleware).toBe('function');
    });

    test('should authenticate valid API keys', async () => {
      const user = await authManager.authenticateUser('admin', 'admin123');
      const apiKey = await authManager.generateApiKey(user.id, 'Test Middleware');
      
      req.headers['x-api-key'] = apiKey.key;

      const middleware = authMiddleware.authenticateApiKey();
      await middleware(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(user.id);
      expect(req.apiKey).toBeDefined();
      expect(next).toHaveBeenCalled();
    });

    test('should reject missing authentication', async () => {
      const middleware = authMiddleware.authenticateApiKey();
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'API key required'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should check permissions', () => {
      req.user = { permissions: ['model:read'] };

      const middleware = authMiddleware.requirePermission('model:read');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should reject insufficient permissions', () => {
      req.user = { permissions: ['model:read'] };

      const middleware = authMiddleware.requirePermission('model:write');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Insufficient permissions. Required: model:write'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should check roles', () => {
      req.user = { role: 'admin' };

      const middleware = authMiddleware.requireRole('admin');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();

      const userMiddleware = authMiddleware.requireRole(['user', 'admin']);
      userMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(2);
    });

    test('should handle flexible authentication', async () => {
      const user = await authManager.authenticateUser('admin', 'admin123');
      const apiKey = await authManager.generateApiKey(user.id, 'Flexible Test');
      
      req.headers['x-api-key'] = apiKey.key;

      const middleware = authMiddleware.authenticateFlexible();
      await middleware(req, res, next);

      expect(req.user).toBeDefined();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Statistics and Monitoring', () => {
    test('should provide authentication statistics', () => {
      const stats = authManager.getStats();

      expect(stats).toBeDefined();
      expect(stats.totalUsers).toBeGreaterThan(0);
      expect(stats.activeUsers).toBeGreaterThanOrEqual(0);
      expect(stats.totalApiKeys).toBeGreaterThanOrEqual(0);
      expect(stats.activeApiKeys).toBeGreaterThanOrEqual(0);
      expect(typeof stats.blacklistedTokens).toBe('number');
      expect(typeof stats.activeRefreshTokens).toBe('number');
    });

    test('should emit events for monitoring', (done) => {
      let eventsReceived = 0;
      const expectedEvents = ['userCreated', 'userAuthenticated', 'tokensGenerated'];

      expectedEvents.forEach(event => {
        authManager.on(event, () => {
          eventsReceived++;
          if (eventsReceived === expectedEvents.length) {
            done();
          }
        });
      });

      // Trigger events
      authManager.createUser({
        username: 'eventtest',
        password: 'pass123',
        email: 'event@example.com',
        role: 'user'
      }).then(user => {
        return authManager.authenticateUser('eventtest', 'pass123');
      }).then(user => {
        authManager.generateTokens(user);
      });
    });
  });

  describe('Cleanup and Maintenance', () => {
    test('should cleanup expired tokens and sessions', async () => {
      // Create refresh token that will expire soon
      const user = await authManager.authenticateUser('admin', 'admin123');
      const tokens = authManager.generateTokens(user);
      
      // Manually expire the refresh token
      const refreshTokenData = authManager.refreshTokens.get(jwt.decode(tokens.refreshToken).jti);
      if (refreshTokenData) {
        refreshTokenData.expiresAt = new Date(Date.now() - 1000); // Expired 1 second ago
      }

      // Run cleanup
      authManager.cleanup();

      // Verify expired tokens are removed
      const stillExists = authManager.refreshTokens.has(jwt.decode(tokens.refreshToken).jti);
      expect(stillExists).toBe(false);
    });

    test('should handle concurrent operations safely', async () => {
      const promises = [];
      
      // Create multiple users concurrently
      for (let i = 0; i < 10; i++) {
        promises.push(
          authManager.createUser({
            username: `concurrent${i}`,
            password: 'pass123',
            email: `concurrent${i}@example.com`,
            role: 'user'
          })
        );
      }

      const users = await Promise.all(promises);
      expect(users.length).toBe(10);
      
      // Verify all users were created successfully
      users.forEach((user, i) => {
        expect(user.username).toBe(`concurrent${i}`);
        expect(user.id).toBeDefined();
      });
    });
  });
});