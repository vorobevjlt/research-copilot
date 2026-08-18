# AI Assistant

Next.js chat application with Clerk authentication, Supabase user syncing, and
CopilotKit.

## Run locally

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

The application uses a local Ollama model by default. Start Ollama locally and
pull the model before chatting:

```bash
ollama pull llama3.1:8b
```

To use a different local model, set `OLLAMA_MODEL` in `.env`. The default Ollama
endpoint is `http://localhost:11434/v1`; set `OLLAMA_BASE_URL` and, if needed,
`OLLAMA_API_KEY` to override it. Keep the existing Clerk and Supabase variables
in `.env` as well. Do not commit that file.

## Deploy on Vercel

No `vercel.json` file is needed: Vercel detects this Next.js application and
builds it with `npm run build`.

1. Import the repository in [Vercel](https://vercel.com/new).
2. In **Project Settings → Environment Variables**, add these values for the
   appropriate environments:

   ```text
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
   CLERK_SECRET_KEY
   CLERK_WEBHOOK_SIGNING_SECRET
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
   SUPABASE_SERVICE_ROLE_KEY
   OLLAMA_BASE_URL               # required for deployed chat; must not be localhost
   OLLAMA_API_KEY                # optional, if your Ollama endpoint requires it
   OLLAMA_MODEL                  # optional; defaults to llama3.1:8b
   ```

3. Deploy the project. For a production deployment, use your production Clerk
   keys and a custom domain configured in both Vercel and Clerk.
4. In the Clerk Dashboard, create or update the production webhook endpoint to
   `https://<your-domain>/api/webhooks/clerk`, subscribe to `user.created`, and
   copy its signing secret to `CLERK_WEBHOOK_SIGNING_SECRET` in Vercel.
5. Redeploy after changing environment variables or the webhook signing secret.

Vercel preview deployments can use development Clerk keys. Configure a separate
production webhook with the exact production URL; ngrok is only needed when
testing webhooks against a local development server.

> Vercel cannot reach Ollama running on your development machine. To use chat in
> a Vercel deployment, point `OLLAMA_BASE_URL` to an Ollama server reachable by
> Vercel. Otherwise, run the application locally with the default endpoint.
