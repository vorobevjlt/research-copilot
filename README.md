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
   XTTS_SERVICE_URL              # URL of the XTTS-v2 service
   XTTS_SERVICE_API_KEY          # shared secret used only by the Next.js server
   VOICE_CLONE_SIGNING_SECRET    # optional; defaults to XTTS_SERVICE_API_KEY
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

## Voice Studio

Authenticated users can open **Voice Studio** from the projects or chat header.
Creating a custom voice requires a consent recording and a separate sample from
the same speaker. Each upload may be up to 10 MiB. The speaker must read the
displayed consent phrase exactly. The Next.js route validates the consent gate,
then sends only the separate voice sample to the XTTS-v2 service.

The service normalizes samples to mono 24 kHz WAV and stores them under a
one-way hash of the authenticated Clerk user ID. The application streams the
generated WAV back to the browser and stores a signed, user-bound voice
reference in that browser for reuse. Using **Forget** deletes both the stored
sample and browser reference. Consent recordings and generated files are not
retained. The current UI keeps one reusable voice per user; creating another
replaces the previous stored sample.

XTTS-v2 supports voice cloning in the languages offered by the Voice Studio
selector. It does not support free-form delivery instructions, so that OpenAI
specific field is intentionally absent.

The **Replace song voice** tab accepts a song up to 50 MiB and five minutes,
separates its lead vocal with Demucs, converts that vocal to the user's saved
authorized voice with FreeVC, and remixes an MP3. The browser obtains a
short-lived user- and origin-bound token from Next.js and uploads the song
directly to the voice server, so large files and long-running CPU jobs do not
pass through a Vercel Function. Keep `XTTS_ALLOWED_ORIGINS` on the voice server
limited to the deployed application origins. Temporary song files are removed
after the converted result is downloaded, or automatically after six hours.
On memory-constrained CPU hosts, XTTS and FreeVC run in separate short-lived
processes so their model allocations are fully released between jobs. FreeVC
processes longer vocals in overlapping chunks to keep peak memory bounded.

FreeVC and its Coqui model entry are MIT-licensed; Demucs is MIT-licensed. Voice
conversion preserves the source timing and melody but is an approximation, and
isolating backing vocals or dense mixes can introduce artifacts.

### Run XTTS-v2

XTTS-v2 model weights use the non-commercial Coqui Public Model License. Review
that license before running the service. This integration is therefore suitable
for personal, evaluation, and other permitted non-commercial use only.

Set the same long random service key for Docker and Next.js, accept the model
license, and start the CPU service:

```bash
export XTTS_SERVICE_API_KEY="replace-with-a-long-random-value"
export COQUI_TOS_AGREED=1
export XTTS_ALLOWED_ORIGINS="https://your-app.example.com,http://localhost:3000"
docker compose -f compose.xtts.yml up --build
```

Then add the following server-only values to `.env.local` and restart Next.js:

```text
XTTS_SERVICE_URL=http://127.0.0.1:8001
XTTS_SERVICE_API_KEY=replace-with-the-same-long-random-value
VOICE_CLONE_SIGNING_SECRET=replace-with-a-different-long-random-value
```

The first startup downloads and loads the XTTS-v2 model. Model and voice data
live in named Docker volumes so container rebuilds do not discard them. The CPU
image works without special hardware but synthesis can be slow. The included
Caddy service provides HTTPS for the configured VPS hostname; set
`XTTS_SERVICE_URL=https://xtts.161.104.50.218.sslip.io` in Vercel. The model
cannot run inside a Vercel Function, and Docker is not required on the machine
running the Next.js client.

The service exposes unauthenticated `GET /health`; all voice creation,
generation, and deletion endpoints require `XTTS_SERVICE_API_KEY` as a bearer
token.
