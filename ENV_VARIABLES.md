# Environment Variables Reference

Complete guide to all environment variables used in the LLM Runner Router project.

## Core Configuration

### Server Settings
| Variable | Default | Description | Required |
|----------|---------|-------------|----------|
| `PORT` | `3006` | Server port number | No |
| `NODE_ENV` | `production` | Environment mode (production/development/test) | No |
| `SERVER_MODE` | `production` | Server mode (production/secure/resilient/development) | No |
| `HOST` | `0.0.0.0` | Server host binding | No |
| `BASE_URL` | `http://localhost:3006` (development), `https://llmrouter.dev:3006` (production) | Base URL for the application | No |

### Model Configuration
| Variable | Default | Description | Required |
|----------|---------|-------------|----------|
| `AUTO_INIT` | `true` | Auto-initialize models on startup | No |
| `MODEL_CACHE_DIR` | `./models` | Directory for model storage | No |
| `DEFAULT_MODEL` | `smollm3` | Default model to use | No |
| `MODEL_LOAD_TIMEOUT` | `60000` | Model loading timeout (ms) | No |
| `MAX_MODEL_SIZE` | `10GB` | Maximum model size to load | No |

### API Configuration
| Variable | Default | Description | Required |
|----------|---------|-------------|----------|
| `API_KEY` | - | API key for authentication | Yes (in production) |
| `ENABLE_AUTH` | `true` | Enable API authentication | No |
| `RATE_LIMIT_WINDOW` | `900000` | Rate limit window (15 min) | No |
| `RATE_LIMIT_MAX` | `100` | Max requests per window | No |
| `ENABLE_CORS` | `true` | Enable CORS support | No |
| `CORS_ORIGIN` | `*` | CORS allowed origins | No |

### Security Settings
| Variable | Default | Description | Required |
|----------|---------|-------------|----------|
| `ENABLE_HELMET` | `true` | Enable helmet security headers | No |
| `ENABLE_RATE_LIMIT` | `true` | Enable rate limiting | No |
| `JWT_SECRET` | - | JWT signing secret | Yes (if using JWT) |
| `SESSION_SECRET` | - | Session secret key | Yes (if using sessions) |
| `SECURE_COOKIES` | `true` | Use secure cookies | No |
| `SSL_CERT_PATH` | - | Path to SSL certificate | No |
| `SSL_KEY_PATH` | - | Path to SSL private key | No |

### Database Configuration
| Variable | Default | Description | Required |
|----------|---------|-------------|----------|
| `DB_TYPE` | `sqlite` | Database type (sqlite/postgres/mysql) | No |
| `DB_PATH` | `./data/llm-router.db` | SQLite database path | No |
| `DB_HOST` | `localhost` | Database host | No (unless using external DB) |
| `DB_PORT` | - | Database port | No |
| `DB_NAME` | `llm_router` | Database name | No |
| `DB_USER` | - | Database username | No |
| `DB_PASSWORD` | - | Database password | No |

### Logging Configuration
| Variable | Default | Description | Required |
|----------|---------|-------------|----------|
| `LOG_LEVEL` | `info` | Log level (error/warn/info/debug) | No |
| `LOG_FORMAT` | `json` | Log format (json/text) | No |
| `LOG_FILE` | `./logs/app.log` | Log file path | No |
| `LOG_ROTATION` | `daily` | Log rotation (daily/weekly/size) | No |
| `LOG_MAX_FILES` | `30` | Max log files to keep | No |

### Performance Tuning
| Variable | Default | Description | Required |
|----------|---------|-------------|----------|
| `MAX_WORKERS` | `4` | Maximum worker processes | No |
| `CACHE_TTL` | `3600` | Cache time-to-live (seconds) | No |
| `ENABLE_CACHE` | `true` | Enable response caching | No |
| `MAX_CONCURRENT_REQUESTS` | `10` | Max concurrent model requests | No |
| `REQUEST_TIMEOUT` | `30000` | Request timeout (ms) | No |

### External Services
| Variable | Default | Description | Required |
|----------|---------|-------------|----------|
| `OPENAI_API_KEY` | - | OpenAI API key | No |
| `ANTHROPIC_API_KEY` | - | Anthropic API key | No |
| `GROQ_API_KEY` | - | Groq API key | No |
| `HUGGINGFACE_TOKEN` | - | HuggingFace access token | No |
| `REDIS_URL` | - | Redis connection URL | No |
| `SMTP_HOST` | - | SMTP server for emails | No |
| `SMTP_PORT` | `587` | SMTP port | No |
| `SMTP_USER` | - | SMTP username | No |
| `SMTP_PASSWORD` | - | SMTP password | No |

### Feature Flags
| Variable | Default | Description | Required |
|----------|---------|-------------|----------|
| `ENABLE_STREAMING` | `true` | Enable streaming responses | No |
| `ENABLE_WEBSOCKETS` | `true` | Enable WebSocket support | No |
| `ENABLE_METRICS` | `true` | Enable metrics collection | No |
| `ENABLE_BYOK` | `false` | Enable Bring Your Own Key | No |
| `ENABLE_ADMIN_API` | `false` | Enable admin API endpoints | No |
| `AUTO_RECOVERY` | `false` | Enable auto-recovery mode | No |

## Environment Files

The project supports multiple environment files:

### File Priority (highest to lowest):
1. `.env.[SERVER_MODE]` (e.g., `.env.production`, `.env.secure`)
2. `.env.local` (for local overrides, not committed)
3. `.env` (default environment file)

### Available Environment Files:

Sample configurations included in the repository:

- `.env.example` - Base template for local and production setup
- `.env.staging.example` - Example staging environment configuration
- `.env.test.example` - Template for test runs

Files that should be created locally (all gitignored):

- `.env` - Default configuration copied from `.env.example`
- `.env.production` - Production settings
- `.env.development` - Development settings
- `.env.test` - Test environment
- `.env.local` - Local overrides

Other specialized modes (e.g., `.env.secure`, `.env.resilient`) can be created if required but are not included in the repository.

## Usage Examples

### Basic Production Setup
```bash
# .env.production
PORT=3006
NODE_ENV=production
SERVER_MODE=production
API_KEY=your-secret-key-here
LOG_LEVEL=warn
ENABLE_AUTH=true
```

### Development Setup
```bash
# .env.development
PORT=3006
NODE_ENV=development
SERVER_MODE=development
AUTO_INIT=false
LOG_LEVEL=debug
ENABLE_AUTH=false
```

### Secure Deployment
```bash
# .env.secure
PORT=3006
NODE_ENV=production
SERVER_MODE=secure
ENABLE_HELMET=true
ENABLE_RATE_LIMIT=true
RATE_LIMIT_MAX=50
JWT_SECRET=your-jwt-secret
SESSION_SECRET=your-session-secret
SECURE_COOKIES=true
```

### With External Services
```bash
# .env with external APIs
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
HUGGINGFACE_TOKEN=hf_...
REDIS_URL=redis://localhost:6379
```

## PM2 Integration

When using PM2, environment variables can be set in multiple ways:

### Via ecosystem.config.cjs
```javascript
env: {
  NODE_ENV: 'production',
  PORT: 3006,
  SERVER_MODE: 'production'
}
```

### Via Command Line
```bash
SERVER_MODE=secure pm2 start ecosystem.config.cjs
```

### Via Environment File
```bash
pm2 start ecosystem.config.cjs --env production
```

## Docker Support

For Docker deployments, use environment files or pass variables:

```dockerfile
# Using env file
docker run --env-file .env.production llm-router

# Passing individual variables
docker run -e PORT=3006 -e NODE_ENV=production llm-router
```

## Security Notes

⚠️ **Important Security Considerations:**

1. **Never commit sensitive values** - Use `.env.local` for secrets
2. **Rotate keys regularly** - Especially API keys and secrets
3. **Use strong values** - Generate cryptographically secure secrets
4. **Limit access** - Restrict file permissions on `.env` files
5. **Validate inputs** - Always validate environment variable values

### Generating Secure Secrets
```bash
# Generate a secure random secret
openssl rand -base64 32

# Generate a JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Troubleshooting

### Common Issues:

1. **Port already in use**
   - Check `PORT` environment variable
   - Ensure no conflicting services on port 3006

2. **Models not loading**
   - Verify `MODEL_CACHE_DIR` path exists
   - Check `AUTO_INIT` setting
   - Ensure sufficient disk space

3. **Authentication failing**
   - Confirm `API_KEY` is set in production
   - Check `ENABLE_AUTH` setting
   - Verify JWT/session secrets are configured

4. **Rate limiting issues**
   - Adjust `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW`
   - Check `ENABLE_RATE_LIMIT` setting

## Best Practices

1. **Use environment-specific files** - Separate configs for each environment
2. **Document custom variables** - Add new variables to this file
3. **Validate on startup** - Check required variables before starting
4. **Use defaults wisely** - Provide sensible defaults for optional vars
5. **Monitor variable usage** - Log which configuration is active