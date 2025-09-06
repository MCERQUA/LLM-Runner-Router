import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
import { AuthenticationManager } from '../../src/api/Auth.js';

describe('Persistent auth storage', () => {
  test('persists users and revokes tokens', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auth-store-'));

    const auth1 = new AuthenticationManager({
      jwtSecret: 'persist-secret',
      bcryptRounds: 4,
      sessionSecret: 'persist-session',
      dataDir: dir
    });
    await new Promise(res => auth1.on('initialized', res));

    const user = await auth1.createUser({
      username: 'alice',
      password: 'password123',
      email: 'alice@example.com',
      role: 'user'
    });

    const tokens = auth1.generateTokens(user);
    const decoded = jwt.decode(tokens.refreshToken);
    auth1.removeAllListeners();

    const auth2 = new AuthenticationManager({
      jwtSecret: 'persist-secret',
      bcryptRounds: 4,
      sessionSecret: 'persist-session',
      dataDir: dir
    });
    await new Promise(res => auth2.on('initialized', res));

    const persistedUser = Array.from(auth2.users.values()).find(u => u.username === 'alice');
    expect(persistedUser).toBeDefined();

    const authUser = await auth2.authenticateUser('alice', 'password123');
    expect(authUser).toBeDefined();

    const storedToken = auth2.refreshTokens.get(decoded.jti);
    expect(storedToken).toBeDefined();

    auth2.revokeToken(tokens.refreshToken);
    const revoked = auth2.refreshTokens.get(decoded.jti);
    expect(revoked).toBeUndefined();

    auth2.removeAllListeners();

    const auth3 = new AuthenticationManager({
      jwtSecret: 'persist-secret',
      bcryptRounds: 4,
      sessionSecret: 'persist-session',
      dataDir: dir
    });
    await new Promise(res => auth3.on('initialized', res));
    const afterReload = auth3.refreshTokens.get(decoded.jti);
    expect(afterReload).toBeUndefined();
  });
});
