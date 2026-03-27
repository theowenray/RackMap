# RackMap Builder

RackMap Builder is a minimalist dark-theme web app for creating homelab topology diagrams with drag-and-drop building blocks.

## Features

- Drag device cards from a palette onto an SVG canvas
- Reposition cards by dragging
- Resize cards directly from the bottom-right corner handle
- Connect nodes with links using **Connect mode**
- Rename devices from the side panel or by double-clicking a card
- Edit selected node properties (size and colors)
- Built-in device icons for server/router/switch/firewall/NAS/VM cards
- Customize diagram theme (canvas, grid, links, default node styling)
- Export your finished diagram as a PNG

## Run locally

No build step is required.

Option 1 (quick): open `index.html` directly in your browser.

Option 2 (recommended):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Project files

- `index.html` – app layout and controls
- `styles.css` – dark UI theme and responsive styling
- `app.js` – editor state, interactions, rendering, and export logic
