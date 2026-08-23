# AI Assistant

Next.js project assistant with Clerk authentication, Supabase persistence,
CopilotKit/AG-UI chat, and a project-isolated RAG knowledge base.

## Run locally

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Set `RAG_SERVER_URL` in `.env` to the FastAPI service, for example
`http://localhost:8000`. The browser talks only to authenticated same-origin
Next.js routes; those routes verify the Clerk user owns the project before
forwarding requests to the RAG service.

Apply the authoritative migrations from the companion
`rag_server/supabase/migrations` directory. Its latest migration converges the
older project column names used by the RAG schema, then adds project settings,
documents, chunks, vector/keyword retrieval functions, and persisted chats.

File uploads use presigned S3-compatible URLs. The storage bucket must allow
browser `PUT` requests from the application origin while remaining private for
reads and listing.

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
   RAG_SERVER_URL                # public URL of the remote FastAPI service
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

> `RAG_SERVER_URL` must be reachable from the deployed Next.js server. It is not
> exposed to browser code.
