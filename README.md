# Sefi Roee's Projects

Personal website hosted on GitHub Pages: [https://sefi-roee.github.io](https://sefi-roee.github.io)

## Projects

### 🎮 Evony Card Compose Optimizer
**Live:** [https://sefi-roee.github.io/evony/](https://sefi-roee.github.io/evony/)

A sophisticated web application for optimizing card composing strategies in Evony's Lucky Composing event.

**Features:**
- Input your card inventory (Green, Blue, Purple, Orange, Red cards)
- Assign custom rankings to Lucky Box outcomes (I-X)
- Get optimal compose recommendations using advanced algorithms
- View results with interactive charts showing residual cards
- Uses LP relaxation + extensive local search for near-optimal solutions

**Technology Stack:**
- Pure JavaScript (no build tools required)
- Bootstrap 5 for responsive UI
- Chart.js for data visualization
- javascript-lp-solver for linear programming
- Custom local search algorithms (1-for-1, 1-for-2, 2-for-2 swaps)

**How to Use:**
1. Enter your card counts
2. Assign rankings to each Lucky Box outcome (higher = more valuable)
3. Click "Optimize Composes!"
4. See which recipes to use and how many cards will remain

### 🎁 Civilization Treasure Chest Calculator
**Live:** [https://sefi-roee.github.io/evony/civilization-treasure/](https://sefi-roee.github.io/evony/civilization-treasure/)

Calculator for chest count planning when each chest randomly gives 1 of 7 civilization tokens.

**Features:**
- Set token targets for each civilization (Y1..Y7)
- Set required success probability (X)
- Solver mode toggle: Auto, Exact only, or Fast approximation only
- Runtime safety warnings for very large inputs

### 🎯 Gen Scrolls Calculator
**Live:** [https://sefi-roee.github.io/evony/gen-scrolls/](https://sefi-roee.github.io/evony/gen-scrolls/)

Calculator for planning repeated scroll attempts with an exact binomial success model.

**Features:**
- Enter the per-scroll success probability
- Set the target number of successes you want to reach
- View exact winning probability for any repetition count
- Use linked sliders to move between win probability and needed repetitions
- See the exact binomial formula rendered with the live input values
- Inspect a probability-vs-attempts curve with the current point highlighted

---

## Development

This site is built with static HTML/CSS/JavaScript and deployed via GitHub Pages.

### Local Development
```bash
# Clone the repository
git clone https://github.com/sefi-roee/sefi-roee.github.io.git
cd sefi-roee.github.io

# For the Evony optimizer, serve locally (required for fetch API)
cd evony
python -m http.server 8000
# Visit http://localhost:8000
```

### File Structure
```
sefi-roee.github.io/
├── index.html          # Main landing page
├── evony/              # Evony Card Compose Optimizer
│   ├── index.html      # Optimizer page
│   ├── app.js          # Core logic & optimization algorithms
│   ├── style.css       # Compact styling
│   └── evony-config.json # Default configuration
└── README.md           # This file
```

## License

© 2026 Sefi Roee. All rights reserved.
