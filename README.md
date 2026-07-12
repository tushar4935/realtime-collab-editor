# Collab Editor

A real-time collaborative document editor (a minimal Google Docs): sign in,
create documents, edit them together in real time with live cursors, and share
by link.

**Live demo:** https://realtime-collab-editor-rust.vercel.app

> The backend is on Render's free tier, which sleeps when idle, so the first
> load after a quiet spell takes ~30-60s to wake (the editor shows
> "Connecting...").

## Screenshots

| Documents | Editor with live cursors |
| --- | --- |
| ![Documents list](docs/screenshots/documents.png) | ![Editor with live cursors](docs/screenshots/editor.png) |

## Features

- **Live collaborative editing** - several people edit one document at once,
  changes show up instantly, and nothing is lost when two people type at the
  same time (Yjs CRDT under the hood).
- **Live cursors and presence** - see who else is in the document and where
  their cursor is, each with a name label and a stable color.
- **Accounts** - register / log in with JWT + bcrypt; a session survives a
  page refresh.
- **Your documents** - create, list, and delete documents; access is scoped to
  the owner and the people they have shared with.
- **Share by link** - every document has an unguessable share link; opening it
  (after logging in) makes you a collaborator.
- **Persistence** - documents live in MongoDB and are restored when reopened,
  so a server restart never loses text.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React + Vite + Tailwind CSS, React Router, Context API |
| Editor | Tiptap (rich text) |
| CRDT / merging | Yjs |
| Sync transport | y-websocket |
| Backend | Node + Express (auth, document metadata, persistence) + y-websocket sync in the same process |
| Database | MongoDB Atlas (free M0 tier) |
| Auth | JWT + bcrypt |

For a plain-English walkthrough of how the real-time merging works (and why I
used a CRDT library instead of writing the merge logic myself), see
[EXPLAINER.md](EXPLAINER.md).

## How it works

- **Auth**: `/api/auth/register`, `/api/auth/login`, `/api/auth/me`. Passwords
  are bcrypt-hashed; login issues a 7-day JWT that the client stores and sends
  on every request.
- **Documents**: `/api/documents` (create / list / delete), metadata in
  MongoDB, access scoped to the owner or a collaborator. The editor lives at
  `/doc/:id`.
- **Real-time sync**: Tiptap is bound to a Yjs `Y.Doc` and synced through a
  y-websocket endpoint (`/collab/<docId>`) that runs in the same Node process as
  the API. The JWT and document access are verified before the websocket
  upgrade, so an unauthorized socket is never established.
- **Presence**: each connection publishes its user (name + color) and cursor
  position over Yjs awareness, an ephemeral channel that is never persisted.
- **Persistence**: each room loads its saved state on open and writes it back to
  the document's `yjsState` field, debounced while editing and flushed when the
  last client leaves.
- **Sharing**: every document has an unguessable `shareId`; `POST
  /api/documents/join/:shareId` adds the current user to `sharedWith`. Login is
  required, so a logged-out visitor is sent to log in and then returned to the
  document.

## Pinned versions

Tiptap, Yjs, and the collaboration extensions must not mix major versions, so
these are pinned exactly (no `^`):

| Package | Version |
| --- | --- |
| `@tiptap/react` | 2.27.2 |
| `@tiptap/pm` | 2.27.2 |
| `@tiptap/starter-kit` | 2.27.2 |
| `@tiptap/extension-collaboration` | 2.27.2 |
| `@tiptap/extension-collaboration-cursor` | 2.27.2 |
| `yjs` | 13.6.31 |
| `y-websocket` | 1.5.4 |
| `ws` | 8.21.0 |
| `express` | 5.2.1 |
| `mongoose` | 9.7.3 |
| `tailwindcss` | 4.3.2 |
| `react-router-dom` | 7.18.1 |
| `bcryptjs` | 3.0.3 |
| `jsonwebtoken` | 9.0.3 |

`bcryptjs` is a pure-JavaScript implementation of bcrypt: same hashing, no
native compilation step to break on free-tier hosts.

## Project structure

```
client/   React app (Vite)
server/   Express API + y-websocket sync endpoint
```

## Setup

### 1. MongoDB Atlas (one-time)

1. Create a free account at https://www.mongodb.com/cloud/atlas/register
2. Create a cluster: choose the **M0 (Free)** tier, any nearby region, default name is fine.
3. When prompted to create a **database user**, pick a username and password and
   save them (avoid `@ : / ?` characters in the password; they break the URI).
4. Under **Network Access**, add IP address `0.0.0.0/0` ("allow access from
   anywhere"). Fine for a demo project; required later so Render can connect.
5. Go to **Database -> Connect -> Drivers** and copy the connection string. It looks like:
   `mongodb+srv://USER:<db_password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
6. Replace `<db_password>` with your real password, and insert a database name
   `collab-editor` after the host, before the `?`:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/collab-editor?retryWrites=true&w=majority`

### 2. Environment variables

```bash
cp server/.env.example server/.env
# then edit server/.env:
#   MONGODB_URI  -> your Atlas connection string
#   JWT_SECRET   -> a long random string; generate one with:
#                   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit `.env` (it is gitignored). `server/.env.example` documents every
variable the server needs. The client needs no `.env` for local development
(the API URL defaults to `http://localhost:4000`; see `client/.env.example`).

### 3. Install and run

```bash
# terminal 1: API server
cd server
npm install
npm run dev          # -> "MongoDB connected" + "API listening on http://localhost:4000"

# terminal 2: client
cd client
npm install
npm run dev          # -> open http://localhost:5173
```

Health check: http://localhost:4000/api/health should return
`{"status":"ok","mongo":"connected"}`.

### 4. Seed data (optional)

```bash
cd server
npm run seed
```

Creates a sample account (`demo@example.com` / `password123`) with one
document. Safe to run more than once; it skips anything that already exists.

## The 2-client test (run after any change to real-time code)

1. Start the server and the client (see above). Log in and open a document.
2. Copy the URL, open a **second tab** (same browser, same login), paste it.
   Both tabs should show a green **Connected** chip.
3. Type in tab A and the text appears in tab B almost instantly. Type in tab B
   and it appears in tab A.
4. The conflict test: put both cursors in the document and type in **both tabs
   at the same time** (one hand on each, or two people). When you stop:
   - both tabs show the **identical** document,
   - every character you typed in either tab is present (nothing lost),
   - nothing appears twice (no duplication).
5. Concurrent same-spot inserts may interleave (e.g. `helwolrldo`). That is
   correct CRDT behavior for simultaneous inserts at one position; the
   guarantee is convergence without loss, not that your words stay contiguous.
6. Presence: with both tabs open, the header lists two entries (your name twice,
   one per connection, the local one marked "(you)"). Click into the editor in
   tab B and tab A shows a colored caret with a name label at B's cursor
   position, moving as B types. Navigate tab B back to your documents and the
   caret and its presence entry disappear from tab A instantly. If a client
   drops without a clean disconnect (killed browser, lost network), the server's
   ~30-second heartbeat reaps it, so a stale cursor can linger up to half a
   minute. That is y-websocket's designed fallback, not a bug.
7. Persistence: type something, then **stop and restart the API server**
   (Ctrl-C in terminal 1, `npm run dev` again). Reload the document and your
   text is still there. It was saved to MongoDB (debounced while you typed, and
   again when the last tab closed) and re-loaded when the room reopened. A
   brand-new document you never typed in opens empty.
8. Sharing: click **Share** in the editor to copy the document's link. Open it
   in a second browser (or a private window) signed in as a **different**
   account. You will be asked to log in first, then dropped into the same
   document as an editor, and it shows up in that account's list marked "Shared
   with you". Both accounts now edit live with named cursors. A logged-in
   account that was never given the link cannot open the document (it 404s), and
   only the owner can delete it.

## Deploy

Three pieces, deployed separately:

- **MongoDB Atlas**: the database (already created in [Setup](#1-mongodb-atlas-one-time)).
- **Backend** (Express API **and** the Yjs websocket, one Node service) -> **Render**.
- **Frontend** (the static React build) -> **Vercel** (or Netlify).

**Why not put it all on Vercel/Netlify?** The Yjs sync runs over a long-lived
websocket. Serverless functions are request/response and time out; they can't
hold a socket open. So the backend runs as an ordinary always-on Node server on
Render, and only the static frontend goes on Vercel/Netlify.

**Order matters**, because the two URLs reference each other:

1. Deploy the **backend** first and note its URL.
2. Deploy the **frontend** pointed at that backend URL.
3. (Recommended) Lock the backend's CORS to the frontend URL.

### 1. Backend on Render

1. Push this repo to GitHub.
2. Render -> **New -> Web Service** -> connect the repo.
3. Settings:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
   - **Health Check Path**: `/api/health`
4. Environment variables:
   - `MONGODB_URI`: your Atlas connection string (same as your local `.env`)
   - `JWT_SECRET`: a long random string (can differ from local)
   - **Do not set `PORT`**: Render provides it and the server already reads it.
5. Create the service and wait for **Live**. Your backend URL looks like
   `https://collab-editor.onrender.com`.

> **Cold start:** the free tier spins the service down after ~15 minutes idle;
> the next request wakes it and takes ~30-60s. During that wake-up the editor
> shows "Connecting...", then connects. If you demo it live, open it a minute
> early to warm it up.

### 2. Frontend on Vercel

1. Vercel -> **Add New -> Project** -> import the repo.
2. **Root Directory**: `client` (Framework preset **Vite** is detected; build
   `npm run build`, output `dist`).
3. Environment variables (from the Render URL above; note **`wss://`** and the
   **`/collab`** path on the websocket one):
   - `VITE_API_URL` = `https://collab-editor.onrender.com`
   - `VITE_WS_URL` = `wss://collab-editor.onrender.com/collab`
4. Deploy. Your frontend URL looks like `https://collab-editor.vercel.app`.
   The committed `client/vercel.json` makes deep links (e.g. `/doc/<id>`,
   `/share/<shareId>`) work on refresh.

**Netlify instead?** Base directory `client`, build `npm run build`, publish
`client/dist`, the same two environment variables. The committed
`client/public/_redirects` handles deep-link refreshes.

### 3. Lock the backend to the frontend (recommended)

On Render, add env var `CLIENT_ORIGIN` = your frontend URL (e.g.
`https://collab-editor.vercel.app`, no trailing slash) and redeploy. The API
then only accepts requests from your frontend. Skip it and everything still
works; the API just allows any origin.

### Seed the deployed database (optional)

Run the seed against Atlas once from your machine:

```bash
cd server
MONGODB_URI="<your-atlas-uri>" JWT_SECRET="anything" npm run seed
```

Creates `demo@example.com` / `password123` with one document.

### Verify the deploy

Open the frontend URL, register, create a document, open it in two tabs, and
watch it sync live. (Remember the ~30-60s cold start on the very first request
after idle.)
