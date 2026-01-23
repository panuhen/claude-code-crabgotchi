# Claude Code Crabgotchi

A cute ASCII crab companion that lives in your VS Code sidebar and reacts to your Claude Code sessions.

```
    ████████
    █▌▐██▌▐█
  ████████████
    ████████
     ▐▐  ▌▌
```

## Features

### Reactive Emotions

Your crab watches Claude Code activity and reacts in real-time:

| Emotion | Trigger |
|---------|---------|
| Neutral | Default idle state |
| Happy | Successful operations, file saves |
| Excited | Multiple successes, tests passing |
| Curious | Plan/Explore agents investigating |
| Thinking | Reading files, running commands, web searches |
| Sad | Errors, test failures |
| Angry | Repeated errors |
| Tired | Long sessions, low energy, inactivity |
| Hungry | Low food stat |
| Surprised | Git commits, unexpected results |

### Tamagotchi Stats

Your crab has four stats that change over time:

- **Food** - Decreases over time, feed your crab to keep it happy
- **Happiness** - Affected by successes (up) and errors (down), capped by hygiene and energy
- **Energy** - Depletes during Claude activity, recovers during inactivity
- **Hygiene** - Decreases when crab poops (from overfeeding), clean up to restore

If stats get too low, your crab will let you know!

### Wellbeing Tracking

- **Sparklines** - ASCII graphs showing 24-hour and 7-day wellbeing trends
- **Crab Age** - Track how long your crab has been with you (days/weeks/months/years)
- **Wellbeing Score** - Hover over sparklines to see current wellbeing percentage

### Interactive Buttons

- **Feed** - Give your crab a snack
- **Pet** - Show some love

### Break Timer

Built-in Pomodoro-style break timer:
- Configurable duration (1-120 minutes)
- Visual countdown in the stats area
- Notification when timer completes
- Snooze option for 5 more minutes

### Customization

- **Crab Color** - Choose from 7 colors (Amber, Green, Blue, Purple, Red, Cyan, White)
- **Bubble Color** - Customize the speech bubble color

### Night Mode

Automatic night mode between 11 PM - 5 AM with stars and moon.

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Claude Code Crabgotchi"
4. Click Install

### From Source

```bash
git clone https://github.com/panuhen/claude-code-crabgotchi.git
cd claude-code-crabgotchi
npm install
npm run compile
```

Then press F5 in VS Code to launch the Extension Development Host.

## How It Works

The extension monitors Claude Code's log files in `~/.claude/projects/` and uses pattern matching to detect:

- Tool calls (Read, Write, Edit, Bash, etc.)
- Success/error messages
- Agent types (Plan, Explore)
- Special keywords and patterns

The crab's emotion updates in real-time as Claude works, giving you a fun visual indicator of your coding session's progress.

## Settings

Access settings via the gear icon in the Crabgotchi panel:

| Setting | Description | Default |
|---------|-------------|---------|
| `crabgotchi.crabColor` | Crab color | Amber (#e5c07b) |
| `crabgotchi.bubbleColor` | Speech bubble color | Amber (#e5c07b) |
| `crabgotchi.breakTimer.enabled` | Enable break timer | false |
| `crabgotchi.breakTimer.minutes` | Timer duration in minutes | 25 |
| `crabgotchi.showStats` | Show wellbeing sparklines | true |

## Requirements

- VS Code 1.85.0 or higher
- Claude Code CLI (for reactive features)

## Performance

The extension is designed to be lightweight:
- **Load time**: ~3ms
- **Activation**: ~9ms
- **Polling interval**: 1 second (only checks file sizes)
- **Incremental reads**: Only reads new content, not full files

## License

MIT

---

Made with Claude Code for Claude Code 🧡
