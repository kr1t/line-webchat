process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://linechatbot:linechatbot@localhost:5433/linechatbot_test';
process.env.LINE_CHANNEL_SECRET ??= 'test-channel-secret';
process.env.LINE_CHANNEL_ACCESS_TOKEN ??= 'test-access-token';
process.env.JWT_SECRET ??= 'test-jwt-secret-that-is-long-enough-123';
process.env.TOTP_ENC_KEY ??= Buffer.alloc(32, 7).toString('base64');
