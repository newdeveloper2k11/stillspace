# Stillspace Meditation

This project is a calm, self-contained meditation website.
It is built with plain HTML, CSS, and JavaScript and served by a small Node.js server.

## Files

- `index.html`: meditation website entry point
- `styles.css`: meditation website styles
- `app.js`: breathing guide, timer, and ambient sound logic

## Run the site

Start the server with:

```powershell
npm start
```

Keep that terminal window open, then open `http://127.0.0.1:3000` in your browser.

On Windows, you can also launch the site by double-clicking `start-site.bat`.

## Experience

The site includes:

- a guided breathing animation
- a 5, 10, or 15 minute session timer
- optional ambient sound generated in the browser
- a minimal Node.js server in `server.js`

## Next upgrades

If you want to turn this into a more powerful AI, the usual next steps are:

1. connect it to an LLM API
2. add tools like web search or file editing
3. give it a GUI or web app
4. store richer long-term memory
