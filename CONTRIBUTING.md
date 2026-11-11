# Contributing to Pawan World

Thanks for taking a look. Pawan World is a browser-first Pokémon fan game and
interactive portfolio built with vanilla JavaScript and three.js.

## Ways to contribute

- **Report a bug** — open an issue with the browser, device, steps to reproduce,
  and a screenshot or console error if possible.
- **Suggest an improvement** — open an issue describing the player problem it
  solves, not only the implementation.
- **Send a pull request** — keep it focused. One feature or fix per PR.

## Development setup

There is no build step to play the game.

```bash
python3 -m http.server 8437
```

Open <http://localhost:8437>. Use landscape orientation on phones.

Run the regression suite before opening a PR:

```bash
node --test
```

The suite covers the wild Pokémon roster, boss-battle math, world-map routing,
and the Greninja glide state machine. All tests must pass.

## Guidelines

- Keep the game client-side. No backend, accounts, or tracking.
- Avoid adding copyrighted Pokémon assets. Reuse the existing models or use
  original placeholders.
- Match the existing style: small ES modules, no frameworks, no bundler.
- Update `NOTICE.md` when adding a third-party library or asset.
- Do not remove the fan-project disclaimer or the Pokémon IP notice.
- Test the change in a real browser, on desktop and, when relevant, a phone.

## Commit messages

Write short, imperative commit messages that explain why the change exists:

```
Add wild Pokémon reactions to the player
Fix world-map route around deep water
```

## Questions

Open an issue or contact [Pawan Sah](https://github.com/Pawan-webdeveloper).
