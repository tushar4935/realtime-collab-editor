# How the real-time collaboration works (plain English)

This is my answer to "did you build the CRDT or use a library?". I integrated
**Yjs**, a CRDT library, and did not write the merge logic myself. That was a
conscious call: correctly merging concurrent edits is a research-grade problem,
and a buggy homemade version silently loses people's text. My work was the
integration around it: binding the editor to the shared document, syncing it
over websockets, authenticating connections, and persisting/restoring the
document state.

## What a CRDT is

A CRDT (Conflict-free Replicated Data Type) is a data structure designed so
that many people can change their own copy at the same time. When the copies
later exchange their changes, in any order and with any delays, every copy ends
up identical, and nobody has to decide "whose change wins".

The trick for text is that a CRDT never says "insert at position 27". Positions
break the moment someone else's edit shifts the text. Instead, every character
gets a permanent identity (roughly: "the 14th character created by user A"),
and an edit says "insert X **after the character with identity so-and-so**". A
character's identity never changes when other text moves around it, so an edit
made against an old version of the document still lands in exactly the right
spot. Deletes don't remove identities either; characters are only marked
invisible (tombstoned), so even an edit anchored to deleted text still resolves.
When two people insert at the *same* spot at the same time, the CRDT breaks the
tie with a deterministic rule (in Yjs, essentially by comparing client ids), so
both copies pick the same order without negotiating.

## Why "broadcast the whole document on every keystroke" loses text

The naive design: on every keystroke, send the entire document to the server,
which forwards it to everyone, and everyone replaces their copy with the last
version received.

That last step is the bug, because **replacing means overwriting**. If Alice
and Bob both type within the same fraction of a second, Alice's snapshot (with
her word, without Bob's) and Bob's snapshot (with his word, without Alice's)
are both in flight at once. Whichever snapshot lands second overwrites the
other, one person's word is gone, and neither of them even gets an error. "Last
write wins" on whole documents means concurrent writes erase each other. It's
also wasteful (a 50-page document re-sent per keystroke), but the correctness
failure is the real reason it's wrong.

Yjs instead sends only a tiny description of *what changed* ("insert 'h' after
character #123"), and every copy **applies** changes rather than being replaced.
Applying Alice's insert and Bob's insert in either order yields the same
document. Nothing can be overwritten because nothing is replaced.

## What y-websocket does

y-websocket is the delivery van, not the brain. The server keeps one shared
Yjs document per document id (a "room"). When a client connects, the two sides
run a short handshake: each tells the other a compact summary of what it already
has (a *state vector*, per-writer counters), and each sends back only the
missing updates. From then on, every local edit is encoded as a small binary
update, sent to the server, and relayed to every other client in the room,
where Yjs applies and merges it. Merging never happens in transit, only inside
Yjs on each end. In this project the relay runs inside the same Node process as
the Express API (REST on `/api`, websocket upgrades on `/collab/<docId>`), and
the server checks the user's JWT and document access before allowing the
upgrade.

## Live cursors: the awareness channel

Presence ("who's here, where is their cursor") rides on a second Yjs channel
called **awareness**, separate from the document. The difference is lifetime:
document edits are permanent and must survive forever, but a cursor position is
only true for the instant it's sent. So awareness state is never stored and
never merged into history. Each client broadcasts a tiny "here's my current
state" (name, color, cursor position), everyone else overwrites their previous
picture of that client, and when a client disconnects its entry is removed and
its cursor vanishes. That happens instantly on a clean disconnect (leaving the
page), or within the server's ~30-second heartbeat if the client just went
silent (crash, lost network). There is one entry per *connection*, not per
account, so the same person in two tabs is two cursors. This is why closing a
tab makes a cursor disappear but never touches the text.

## How the document survives a server restart

A Yjs document can be serialized into one compact binary blob (an *update*
encoding its whole state, the same format as the incremental updates, just all
of them merged). The server saves that blob into the document's row in MongoDB,
debounced a couple of seconds after edits stop rather than per keystroke, and
again when the last client leaves the room. I store the whole document as one
blob in its existing row (next to its title and owner) rather than reaching for
a drop-in library like `y-mongodb-provider`: that library keeps its own
separate collection of incremental updates keyed by room name, which would split
one document across two places. Keeping one document = one row means the
ownership check and the stored bytes can never drift apart. The only Yjs calls
involved are `encodeStateAsUpdate` and `applyUpdate`; I own *when* to save,
never any merge logic. When someone later opens the document, the server loads
the blob from MongoDB, applies it to a fresh in-memory Yjs document, and hands
that to the room, and clients then sync from it as usual. Loading is just
"apply one big update", the same operation as normal syncing. Without this, the
rooms would live only in server memory and every restart would wipe every
document.

## The one-liner

> The editor binds to a shared Yjs CRDT document; every keystroke becomes a tiny
> update that y-websocket relays to the other clients, where Yjs merges it, so
> concurrent edits converge instead of overwriting each other. The merged state
> is periodically serialized into MongoDB and re-applied when the document is
> opened again.
