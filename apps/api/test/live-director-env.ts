process.env.DIRECTOR_MODE = 'live';
process.env.GOOGLE_API_KEY = 'test-google-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
delete process.env.DATABASE_URL;
delete process.env.DIRECT_URL;
