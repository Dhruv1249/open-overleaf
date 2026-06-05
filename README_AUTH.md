GitHub OAuth setup

1. Copy `.env.example` to `.env.local` and fill in `GITHUB_CLIENT_SECRET` and `SESSION_SECRET`.
2. In your GitHub OAuth App settings, set the Authorization callback URL to:
   - http://localhost:3000/api/auth/github/callback (for local dev)
   - https://<CLOUD_RUN_DOMAIN>/api/auth/github/callback (for production)
3. Start the app and visit `/api/auth/github/login` to begin the flow.

Security notes:
- Never commit `.env.local` to source control.
- Keep `SESSION_SECRET` long and random.