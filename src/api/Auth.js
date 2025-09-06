/**
 * Authentication & Authorization System for LLM Runner Router
 * Supports JWT, API Keys, OAuth 2.0, and role-based access control
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import crypto from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { PersistentMap } from '../db/PersistentMap.js';
import { Logger } from '../utils/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = new Logger('Auth');

export class AuthenticationManager extends EventEmitter {
  constructor(options = {}) {
    super();
    if (!options.jwtSecret && !process.env.JWT_SECRET) {
      throw new Error('JWT secret must be provided via options or JWT_SECRET env variable');
    }
    if (!options.sessionSecret && !process.env.SESSION_SECRET) {
      throw new Error('Session secret must be provided via options or SESSION_SECRET env variable');
    }

    this.options = {
      jwtSecret: options.jwtSecret || process.env.JWT_SECRET,
      jwtExpiresIn: options.jwtExpiresIn || '24h',
      refreshTokenExpiresIn: options.refreshTokenExpiresIn || '7d',
      bcryptRounds: options.bcryptRounds || 12,
      apiKeyLength: options.apiKeyLength || 32,
      maxLoginAttempts: options.maxLoginAttempts || 5,
      lockoutDuration: options.lockoutDuration || 15 * 60 * 1000, // 15 minutes
      sessionSecret: options.sessionSecret || process.env.SESSION_SECRET,
      oauth: {
        clientID: options.oauth?.clientID || process.env.OAUTH_CLIENT_ID,
        clientSecret: options.oauth?.clientSecret || process.env.OAUTH_CLIENT_SECRET,
        callbackURL: options.oauth?.callbackURL || '/auth/oauth2/callback',
        authorizationURL: options.oauth?.authorizationURL || 'https://example.com/oauth2/authorize',
        tokenURL: options.oauth?.tokenURL || 'https://example.com/oauth2/token',
        userProfileURL: options.oauth?.userProfileURL || 'https://example.com/api/user',
        scope: options.oauth?.scope || ['read', 'write']
      },
      dataDir: options.dataDir || path.join(__dirname, '../../data'),
      ...options
    };

    this.users = new PersistentMap(path.join(this.options.dataDir, 'users.json'));
    this.apiKeys = new PersistentMap(path.join(this.options.dataDir, 'auth-api-keys.json'));
    this.refreshTokens = new PersistentMap(path.join(this.options.dataDir, 'refresh-tokens.json'));
    this.blacklistedTokens = new Set();
    this.loginAttempts = new Map();
    this.sessions = new Map();

    // Role-based permissions
    this.roles = {
      admin: {
        permissions: ['*'],
        description: 'Full system access'
      },
      user: {
        permissions: ['model:read', 'inference:create', 'chat:create'],
        description: 'Standard user access'
      },
      readonly: {
        permissions: ['model:read', 'health:read', 'metrics:read'],
        description: 'Read-only access'
      },
      api: {
        permissions: ['inference:create', 'chat:create', 'model:read'],
        description: 'API access for automated systems'
      }
    };

    this.initialize();
  }

  /**
   * Initialize authentication system
   */
  async initialize() {
    await Promise.all([
      this.users.load(),
      this.apiKeys.load(),
      this.refreshTokens.load()
    ]);
    this.setupPassport();
    if (process.env.NODE_ENV !== 'production') {
      await this.createDefaultUsers();
    }
    this.emit('initialized');
  }

  /**
   * Setup Passport.js strategies
   */
  setupPassport() {
    // Local strategy for username/password
    passport.use(new LocalStrategy({
      usernameField: 'username',
      passwordField: 'password'
    }, async (username, password, done) => {
      try {
        const user = await this.authenticateUser(username, password);
        if (!user) {
          return done(null, false, { message: 'Invalid credentials' });
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }));

    // JWT strategy for token-based auth
    passport.use(new JwtStrategy({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: this.options.jwtSecret,
      issuer: 'llm-router',
      audience: 'llm-router-api'
    }, async (payload, done) => {
      try {
        // Check if token is blacklisted
        if (this.blacklistedTokens.has(payload.jti)) {
          return done(null, false, { message: 'Token has been revoked' });
        }

        const user = this.users.get(payload.sub);
        if (!user) {
          return done(null, false, { message: 'User not found' });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }));

    // OAuth 2.0 strategy
    if (this.options.oauth.clientID && this.options.oauth.clientSecret) {
      passport.use(new OAuth2Strategy({
        authorizationURL: this.options.oauth.authorizationURL,
        tokenURL: this.options.oauth.tokenURL,
        clientID: this.options.oauth.clientID,
        clientSecret: this.options.oauth.clientSecret,
        callbackURL: this.options.oauth.callbackURL
      }, async (accessToken, refreshToken, profile, done) => {
        try {
          // Find or create user based on OAuth profile
          let user = Array.from(this.users.values()).find(u => u.oauthId === profile.id);
          
          if (!user) {
            user = await this.createUser({
              username: profile.username || profile.email || `oauth_${profile.id}`,
              email: profile.email,
              name: profile.displayName || profile.name,
              role: 'user',
              oauthId: profile.id,
              oauthProvider: 'oauth2',
              verified: true
            });
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }));
    }

    // Serialize/deserialize user for sessions
    passport.serializeUser((user, done) => {
      done(null, user.id);
    });

    passport.deserializeUser((id, done) => {
      const user = this.users.get(id);
      done(null, user);
    });
  }

  /**
   * Create default users for testing
   */
  async createDefaultUsers() {
    const adminHash = process.env.DEFAULT_ADMIN_PASSWORD_HASH;
    const userHash = process.env.DEFAULT_USER_PASSWORD_HASH;
    const apiHash = process.env.DEFAULT_API_PASSWORD_HASH;

    if (adminHash) {
      await this.createUser({
        username: 'admin',
        passwordHash: adminHash,
        email: 'admin@llm-router.com',
        name: 'Administrator',
        role: 'admin',
        verified: true
      });
    }

    if (userHash) {
      await this.createUser({
        username: 'user',
        passwordHash: userHash,
        email: 'user@llm-router.com',
        name: 'Regular User',
        role: 'user',
        verified: true
      });
    }

    if (apiHash) {
      await this.createUser({
        username: 'api',
        passwordHash: apiHash,
        email: 'api@llm-router.com',
        name: 'API User',
        role: 'api',
        verified: true
      });
    }
  }

  /**
   * Create a new user
   */
  async createUser(userData) {
    try {
      const userId = uuidv4();
      const hashedPassword = userData.passwordHash || (userData.password ? await bcrypt.hash(userData.password, this.options.bcryptRounds) : null);

      const user = {
        id: userId,
        username: userData.username,
        password: hashedPassword,
        email: userData.email,
        name: userData.name,
        role: userData.role || 'user',
        permissions: this.roles[userData.role || 'user']?.permissions || [],
        verified: userData.verified || false,
        oauthId: userData.oauthId,
        oauthProvider: userData.oauthProvider,
        createdAt: new Date(),
        lastLogin: null,
        loginCount: 0,
        active: true,
        metadata: userData.metadata || {}
      };

      this.users.set(userId, user);
      this.emit('userCreated', user);
      
      return { ...user, password: undefined }; // Don't return password
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Authenticate user with username/password
   */
  async authenticateUser(username, password) {
    try {
      // Check for rate limiting
      const attemptKey = `login:${username}`;
      const attempts = this.loginAttempts.get(attemptKey) || { count: 0, lockedUntil: null };

      if (attempts.lockedUntil && attempts.lockedUntil > Date.now()) {
        throw new Error('Account temporarily locked due to too many failed attempts');
      }

      // Find user
      const user = Array.from(this.users.values()).find(u => u.username === username);
      if (!user || !user.active) {
        this.recordFailedAttempt(attemptKey);
        return null;
      }

      // Check password
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        this.recordFailedAttempt(attemptKey);
        return null;
      }

      // Clear failed attempts on successful login
      this.loginAttempts.delete(attemptKey);

      // Update user login info
      user.lastLogin = new Date();
      user.loginCount++;

      this.emit('userAuthenticated', user);
      return { ...user, password: undefined };
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Record failed login attempt
   */
  recordFailedAttempt(attemptKey) {
    const attempts = this.loginAttempts.get(attemptKey) || { count: 0, lockedUntil: null };
    attempts.count++;

    if (attempts.count >= this.options.maxLoginAttempts) {
      attempts.lockedUntil = Date.now() + this.options.lockoutDuration;
      this.emit('accountLocked', { attemptKey, lockedUntil: attempts.lockedUntil });
    }

    this.loginAttempts.set(attemptKey, attempts);
  }

  /**
   * Generate JWT token
   */
  generateTokens(user) {
    const tokenId = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    // Access token
    const accessToken = jwt.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions,
      jti: tokenId,
      iat: now,
      iss: 'llm-router',
      aud: 'llm-router-api'
    }, this.options.jwtSecret, {
      expiresIn: this.options.jwtExpiresIn
    });

    // Refresh token
    const refreshTokenId = uuidv4();
    const refreshToken = jwt.sign({
      sub: user.id,
      jti: refreshTokenId,
      type: 'refresh',
      iat: now,
      iss: 'llm-router',
      aud: 'llm-router-api'
    }, this.options.jwtSecret, {
      expiresIn: this.options.refreshTokenExpiresIn
    });

    // Store refresh token
    this.refreshTokens.set(refreshTokenId, {
      userId: user.id,
      token: refreshToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    this.emit('tokensGenerated', { userId: user.id, tokenId, refreshTokenId });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.options.jwtExpiresIn,
      tokenId,
      refreshTokenId
    };
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.options.jwtSecret);
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }

      const storedToken = this.refreshTokens.get(decoded.jti);
      if (!storedToken || storedToken.token !== refreshToken) {
        throw new Error('Refresh token not found or invalid');
      }

      if (storedToken.expiresAt < new Date()) {
        this.refreshTokens.delete(decoded.jti);
        throw new Error('Refresh token expired');
      }

      const user = this.users.get(decoded.sub);
      if (!user || !user.active) {
        throw new Error('User not found or inactive');
      }

      // Generate new tokens
      const tokens = this.generateTokens(user);
      
      // Remove old refresh token
      this.refreshTokens.delete(decoded.jti);

      this.emit('tokenRefreshed', { userId: user.id, oldTokenId: decoded.jti });
      
      return tokens;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Revoke token (blacklist)
   */
  revokeToken(token) {
    try {
      const decoded = jwt.decode(token);
      if (decoded && decoded.jti) {
        this.blacklistedTokens.add(decoded.jti);
        this.refreshTokens.delete(decoded.jti);
        this.emit('tokenRevoked', { tokenId: decoded.jti, userId: decoded.sub });
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Generate API key
   */
  async generateApiKey(userId, name, permissions = [], expiresAt = null) {
    try {
      const user = this.users.get(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const apiKeyId = uuidv4();
      const key = this.generateRandomKey(this.options.apiKeyLength);
      const hashedKey = await bcrypt.hash(key, this.options.bcryptRounds);

      const apiKey = {
        id: apiKeyId,
        userId: userId,
        name: name,
        key: hashedKey,
        permissions: permissions.length > 0 ? permissions : user.permissions,
        createdAt: new Date(),
        expiresAt: expiresAt,
        lastUsed: null,
        usageCount: 0,
        active: true
      };

      this.apiKeys.set(apiKeyId, apiKey);
      this.emit('apiKeyGenerated', { userId, apiKeyId, name });

      return {
        id: apiKeyId,
        key: `llmr_${key}`, // Prefix for identification
        name: name,
        permissions: apiKey.permissions,
        expiresAt: expiresAt
      };
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Validate API key
   */
  async validateApiKey(key) {
    try {
      if (!key.startsWith('llmr_')) {
        return null;
      }

      const cleanKey = key.replace('llmr_', '');
      
      for (const [_id, apiKey] of this.apiKeys) {
        if (!apiKey.active) continue;
        
        if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
          apiKey.active = false;
          continue;
        }

        const isValid = await bcrypt.compare(cleanKey, apiKey.key);
        if (isValid) {
          // Update usage stats
          apiKey.lastUsed = new Date();
          apiKey.usageCount++;

          const user = this.users.get(apiKey.userId);
          if (!user || !user.active) {
            return null;
          }

          this.emit('apiKeyUsed', { apiKeyId: _id, userId: apiKey.userId });

          return {
            user: { ...user, password: undefined },
            apiKey: { ...apiKey, key: undefined },
            permissions: apiKey.permissions
          };
        }
      }

      return null;
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  /**
   * Revoke API key
   */
  revokeApiKey(apiKeyId) {
    const apiKey = this.apiKeys.get(apiKeyId);
    if (apiKey) {
      apiKey.active = false;
      this.emit('apiKeyRevoked', { apiKeyId, userId: apiKey.userId });
      return true;
    }
    return false;
  }

  /**
   * Check user permissions
   */
  hasPermission(user, permission) {
    if (!user || !user.permissions) {
      return false;
    }

    // Admin has all permissions
    if (user.permissions.includes('*')) {
      return true;
    }

    // Check exact permission
    if (user.permissions.includes(permission)) {
      return true;
    }

    // Check wildcard permissions
    const permissionParts = permission.split(':');
    for (let i = permissionParts.length; i > 0; i--) {
      const wildcardPermission = permissionParts.slice(0, i).join(':') + ':*';
      if (user.permissions.includes(wildcardPermission)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate random key
   */
  generateRandomKey(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Get user by ID
   */
  getUser(userId) {
    const user = this.users.get(userId);
    return user ? { ...user, password: undefined } : null;
  }

  /**
   * Update user
   */
  async updateUser(userId, updates) {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Hash password if updating
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, this.options.bcryptRounds);
    }

    // Update permissions if role changed
    if (updates.role && this.roles[updates.role]) {
      updates.permissions = this.roles[updates.role].permissions;
    }

    Object.assign(user, updates);
    this.emit('userUpdated', { userId, updates });
    
    return { ...user, password: undefined };
  }

  /**
   * Delete user
   */
  deleteUser(userId) {
    const user = this.users.get(userId);
    if (!user) {
      return false;
    }

    // Revoke all API keys for this user
    for (const [keyId, apiKey] of this.apiKeys) {
      if (apiKey.userId === userId) {
        this.revokeApiKey(keyId);
      }
    }

    // Remove all refresh tokens for this user
    for (const [tokenId, refreshToken] of this.refreshTokens) {
      if (refreshToken.userId === userId) {
        this.refreshTokens.delete(tokenId);
      }
    }

    this.users.delete(userId);
    this.emit('userDeleted', { userId });
    
    return true;
  }

  /**
   * List users with pagination
   */
  listUsers(options = {}) {
    const { limit = 50, offset = 0, role, active } = options;
    
    let users = Array.from(this.users.values());
    
    // Apply filters
    if (role) {
      users = users.filter(u => u.role === role);
    }
    
    if (active !== undefined) {
      users = users.filter(u => u.active === active);
    }

    // Sort by creation date
    users.sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    const total = users.length;
    const paginatedUsers = users.slice(offset, offset + limit);

    return {
      users: paginatedUsers.map(u => ({ ...u, password: undefined })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
  }

  /**
   * List API keys for user
   */
  listApiKeys(userId) {
    const apiKeys = [];
    
    for (const [, apiKey] of this.apiKeys) {
      if (apiKey.userId === userId) {
        apiKeys.push({
          ...apiKey,
          key: undefined // Don't return the actual key
        });
      }
    }

    return apiKeys.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get authentication statistics
   */
  getStats() {
    const now = new Date();
    const activeUsers = Array.from(this.users.values()).filter(u => u.active).length;
    const activeApiKeys = Array.from(this.apiKeys.values()).filter(k => k.active && (!k.expiresAt || k.expiresAt > now)).length;
    const blacklistedTokensCount = this.blacklistedTokens.size;
    const refreshTokensCount = this.refreshTokens.size;

    return {
      totalUsers: this.users.size,
      activeUsers,
      totalApiKeys: this.apiKeys.size,
      activeApiKeys,
      blacklistedTokens: blacklistedTokensCount,
      activeRefreshTokens: refreshTokensCount,
      lockedAccounts: Array.from(this.loginAttempts.values()).filter(a => a.lockedUntil && a.lockedUntil > Date.now()).length
    };
  }

  /**
   * Generate secure random secret
   */
  generateSecureSecret() {
    const secret = crypto.randomBytes(64).toString('hex');
    logger.warn('🚨 SECURITY WARNING: Using auto-generated secret. Set JWT_SECRET and SESSION_SECRET environment variables for production.');
    return secret;
  }

  /**
   * Cleanup expired tokens and sessions
   */
  cleanup() {
    const now = new Date();
    
    // Remove expired refresh tokens
    for (const [tokenId, refreshToken] of this.refreshTokens) {
      if (refreshToken.expiresAt < now) {
        this.refreshTokens.delete(tokenId);
      }
    }

    // Remove expired API keys
    for (const [, apiKey] of this.apiKeys) {
      if (apiKey.expiresAt && apiKey.expiresAt < now) {
        apiKey.active = false;
      }
    }

    // Remove old blacklisted tokens (older than 24 hours)
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    for (const tokenId of this.blacklistedTokens) {
      try {
        const decoded = jwt.decode(tokenId);
        if (decoded && decoded.iat && decoded.iat * 1000 < cutoff) {
          this.blacklistedTokens.delete(tokenId);
        }
      } catch (error) {
        // Remove invalid tokens
        this.blacklistedTokens.delete(tokenId);
      }
    }

    // Clear old login attempts
    for (const [key, attempts] of this.loginAttempts) {
      if (!attempts.lockedUntil || attempts.lockedUntil < Date.now()) {
        this.loginAttempts.delete(key);
      }
    }

    this.emit('cleanupCompleted');
  }
}

/**
 * Express middleware for authentication
 */
export class AuthMiddleware {
  constructor(authManager) {
    this.authManager = authManager;
  }

  /**
   * JWT authentication middleware
   */
  authenticate() {
    return (req, res, next) => {
      passport.authenticate('jwt', { session: false }, (err, user, info) => {
        if (err) {
          return next(err);
        }

        if (!user) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: info?.message || 'Invalid or expired token'
          });
        }

        req.user = user;
        next();
      })(req, res, next);
    };
  }

  /**
   * API key authentication middleware
   */
  authenticateApiKey() {
    return async (req, res, next) => {
      try {
        const apiKey = req.headers['x-api-key'] || req.query.apiKey;
        
        if (!apiKey) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'API key required'
          });
        }

        const result = await this.authManager.validateApiKey(apiKey);
        if (!result) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid API key'
          });
        }

        req.user = result.user;
        req.apiKey = result.apiKey;
        req.userPermissions = result.permissions;
        next();
      } catch (error) {
        res.status(500).json({
          error: 'Authentication error',
          message: error.message
        });
      }
    };
  }

  /**
   * Permission check middleware
   */
  requirePermission(permission) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      const hasPermission = this.authManager.hasPermission(req.user, permission);
      if (!hasPermission) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Insufficient permissions. Required: ${permission}`
        });
      }

      next();
    };
  }

  /**
   * Role-based access control
   */
  requireRole(roles) {
    const roleArray = Array.isArray(roles) ? roles : [roles];
    
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      if (!roleArray.includes(req.user.role)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Insufficient role. Required: ${roleArray.join(' or ')}, Have: ${req.user.role}`
        });
      }

      next();
    };
  }

  /**
   * Flexible authentication (JWT or API key)
   */
  authenticateFlexible() {
    return async (req, res, next) => {
      // Try JWT first
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        return this.authenticate()(req, res, next);
      }

      // Try API key
      const apiKey = req.headers['x-api-key'] || req.query.apiKey;
      if (apiKey) {
        return this.authenticateApiKey()(req, res, next);
      }

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required (Bearer token or API key)'
      });
    };
  }
}

export default AuthenticationManager;