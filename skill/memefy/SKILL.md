---
name: memefy
version: 0.2.0
description: |
  Send a reaction GIF to the Crabgotchi sidebar in VS Code. Use this skill
  to add a meme/GIF reaction when it would make a response more fun or
  expressive — celebrations, mock outrage, "it works!", "rip", agreement,
  confusion, etc. The user has explicitly opted into this; use it sparingly
  and tastefully (at most one GIF per reply, and only when it adds
  personality, not as filler). Skip in serious or production contexts
  (incidents, security reviews, code reviews).
allowed-tools:
  - Bash
---

# memefy: send a reaction GIF to Crabgotchi

When invoked, run the queue script with a search query that captures the
mood of the moment. The script appends a JSON line to
`~/.claude/skills/memefy/queue.jsonl`. The Crabgotchi VS Code extension
watches that file, fetches a matching GIF from Giphy, and overlays it on
the crab in its sidebar webview for a few seconds.

## How to invoke

```bash
bash ~/.claude/skills/memefy/render.sh "<query>"
```

`<query>` is a short phrase like `celebrate`, `it works`, `mind blown`,
`facepalm`, `thumbs up`, `excited dog`. Giphy handles the search.

Optional: `MEMEFY_DURATION=6 bash …` to override the on-screen duration
(default 4 seconds).

## When to use

- The user just made a joke or asked something playful.
- A task succeeded after a struggle and a small celebration fits.
- The user explicitly asks for a GIF (`/memefy <thing>` or "give me a gif of X").

## When NOT to use

- Serious technical work (debugging prod, security audits, postmortems).
- More than once per reply.
- When the user has signaled "no GIFs" or seems busy/focused.

## Requirements

- The Crabgotchi VS Code extension is installed and its sidebar is open.
- A Giphy API key is configured in VS Code settings under
  `crabgotchi.memefy.giphyApiKey`.

If Crabgotchi isn't running or the queue file isn't being watched, the
skill silently no-ops (no terminal corruption, no errors visible to the
user).

## Toggle off

In VS Code settings: set `crabgotchi.memefy.enabled` to `false`. Or
disable the skill globally:
`mv ~/.claude/skills/memefy ~/.claude/skills/_memefy`.
