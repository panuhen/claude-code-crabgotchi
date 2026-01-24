import * as vscode from 'vscode';
import { Emotion } from './ascii/crabArt';

export interface CrabStats {
  hunger: number;    // 0-100, decreases over time
  happiness: number; // 0-100, affected by events
  energy: number;    // 0-100, depletes during sessions
  hygiene: number;   // 0-100, affected by poop
  poopCount: number; // 0+, increases when overfed
  lastFed: number;   // timestamp
  lastInteraction: number; // timestamp
}

export interface CrabLifetimeStats {
  birthDate: number;  // timestamp when crab was created
  wellbeingHistory: { timestamp: number; score: number }[];  // periodic snapshots
}

export interface CrabState {
  emotion: Emotion;
  stats: CrabStats;
  emotionExpiry: number; // timestamp when emotion should decay
  customBubble?: string; // temporary custom bubble text (e.g., easter eggs)
  easterEggType?: 'force' | 'commit' | 'friday'; // type of easter egg for styling
}

type StateChangeCallback = (state: CrabState) => void;

const STAT_DECAY_INTERVAL = 60000; // 1 minute
const EMOTION_DURATION = 10000; // 10 seconds before decaying to neutral
const HUNGER_DECAY_RATE = 2;
const HAPPINESS_DECAY_RATE = 1;
const ENERGY_DECAY_RATE = 1;
const ENERGY_RECOVERY_RATE = 2; // Energy recovery while sleeping
const ACTIVITY_ENERGY_DRAIN = 1; // Energy drain per Claude activity
const POOP_HYGIENE_PENALTY = 15; // Hygiene drop per poop
const LOW_HYGIENE_THRESHOLD = 50; // Below this, happiness drains faster

// Happiness cap based on hygiene and energy (can't be truly happy when dirty or exhausted)
function getMaxHappiness(hygiene: number, energy: number): number {
  // Base cap from hygiene
  let max: number;
  if (hygiene >= 80) max = 100;
  else if (hygiene >= 60) max = 80;
  else if (hygiene >= 40) max = 60;
  else if (hygiene >= 20) max = 50;
  else max = 30;

  // Energy penalty: exhausted crab can't be fully happy
  if (energy === 0) {
    max = Math.min(max, 80); // Zero energy: cap at 80
  } else if (energy < 20) {
    max = Math.min(max, 90); // Low energy: cap at 90
  }

  return max;
}
const POOP_TIMER_MIN = 45 * 60 * 1000; // 45 minutes minimum
const POOP_TIMER_MAX = 60 * 60 * 1000; // 60 minutes maximum
const INACTIVITY_CHECK_INTERVAL = 5000; // Check every 5 seconds
const INACTIVITY_THRESHOLD = 300000; // 5 minutes of inactivity → sleepy

export class CrabStateManager {
  private state: CrabState;
  private lifetimeStats: CrabLifetimeStats;
  private context: vscode.ExtensionContext;
  private decayTimer: NodeJS.Timeout | null = null;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private poopTimer: NodeJS.Timeout | null = null;
  private wellbeingTimer: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();
  private lastDecay: number = Date.now();
  private callbacks: StateChangeCallback[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.state = this.loadState();
    this.lifetimeStats = this.loadLifetimeStats();
    this.startDecayTimer();
    this.scheduleRandomPoop();
    this.startWellbeingTracker();
  }

  private loadState(): CrabState {
    const saved = this.context.globalState.get<CrabState>('crabState');
    if (saved) {
      // Recalculate stats based on time passed
      const now = Date.now();
      const timePassed = now - saved.stats.lastInteraction;
      const minutesPassed = Math.floor(timePassed / 60000);

      return {
        emotion: 'neutral',
        stats: {
          hunger: Math.max(0, saved.stats.hunger - minutesPassed * HUNGER_DECAY_RATE),
          happiness: saved.stats.happiness,
          energy: Math.min(100, saved.stats.energy + Math.floor(minutesPassed / 5)), // Recovers while away
          hygiene: saved.stats.hygiene ?? 100, // Default to clean if not present
          poopCount: saved.stats.poopCount ?? 0, // Default to no poop if not present
          lastFed: saved.stats.lastFed,
          lastInteraction: now
        },
        emotionExpiry: 0
      };
    }

    // Default state for new crab
    return {
      emotion: 'neutral',
      stats: {
        hunger: 80,
        happiness: 70,
        energy: 100,
        hygiene: 100,
        poopCount: 0,
        lastFed: Date.now(),
        lastInteraction: Date.now()
      },
      emotionExpiry: 0
    };
  }

  private saveState(): void {
    // Don't persist easter egg state - it's temporary
    const { customBubble, easterEggType, ...stateToSave } = this.state;
    this.context.globalState.update('crabState', stateToSave);
  }

  private loadLifetimeStats(): CrabLifetimeStats {
    const saved = this.context.globalState.get<CrabLifetimeStats>('crabLifetimeStats');
    if (saved) {
      return saved;
    }
    // New crab - set birth date
    return {
      birthDate: Date.now(),
      wellbeingHistory: []
    };
  }

  private saveLifetimeStats(): void {
    this.context.globalState.update('crabLifetimeStats', this.lifetimeStats);
  }

  private startWellbeingTracker(): void {
    // Record wellbeing every hour
    this.wellbeingTimer = setInterval(() => {
      this.recordWellbeing();
    }, 60 * 60 * 1000); // 1 hour

    // Also record on startup
    this.recordWellbeing();
  }

  private recordWellbeing(): void {
    const score = this.calculateWellbeing();
    this.lifetimeStats.wellbeingHistory.push({
      timestamp: Date.now(),
      score
    });
    // Keep last 7 days of hourly data (168 entries max)
    if (this.lifetimeStats.wellbeingHistory.length > 168) {
      this.lifetimeStats.wellbeingHistory = this.lifetimeStats.wellbeingHistory.slice(-168);
    }
    this.saveLifetimeStats();
  }

  public calculateWellbeing(): number {
    const { hunger, happiness, energy, hygiene } = this.state.stats;
    return Math.round((hunger + happiness + energy + hygiene) / 4);
  }

  public getWellbeingTrend(): 'up' | 'down' | 'stable' {
    const history = this.lifetimeStats.wellbeingHistory;
    if (history.length < 2) return 'stable';

    // Compare recent average (last 6 hours) vs older (6-24 hours ago)
    const now = Date.now();
    const sixHoursAgo = now - 6 * 60 * 60 * 1000;
    const dayAgo = now - 24 * 60 * 60 * 1000;

    const recent = history.filter(h => h.timestamp > sixHoursAgo);
    const older = history.filter(h => h.timestamp <= sixHoursAgo && h.timestamp > dayAgo);

    if (recent.length === 0 || older.length === 0) return 'stable';

    const recentAvg = recent.reduce((sum, h) => sum + h.score, 0) / recent.length;
    const olderAvg = older.reduce((sum, h) => sum + h.score, 0) / older.length;

    const diff = recentAvg - olderAvg;
    if (diff > 5) return 'up';
    if (diff < -5) return 'down';
    return 'stable';
  }

  public getSparkline(hours: number, bars: number = 8): string {
    const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const history = this.lifetimeStats.wellbeingHistory;
    const now = Date.now();
    const cutoff = now - hours * 60 * 60 * 1000;

    const relevant = history.filter(h => h.timestamp > cutoff);
    if (relevant.length === 0) return blocks[4].repeat(bars); // Default middle

    // Divide into time buckets
    const bucketSize = (hours * 60 * 60 * 1000) / bars;
    const buckets: number[][] = Array.from({ length: bars }, () => []);

    for (const entry of relevant) {
      const bucketIndex = Math.min(
        bars - 1,
        Math.floor((entry.timestamp - cutoff) / bucketSize)
      );
      buckets[bucketIndex].push(entry.score);
    }

    // Calculate average for each bucket, interpolate empty ones
    const averages = buckets.map(bucket => {
      if (bucket.length === 0) return null;
      return bucket.reduce((a, b) => a + b, 0) / bucket.length;
    });

    // Fill empty buckets with interpolated values
    let lastValue = 50;
    for (let i = 0; i < averages.length; i++) {
      if (averages[i] === null) {
        averages[i] = lastValue;
      } else {
        lastValue = averages[i]!;
      }
    }

    // Convert to blocks (0-100 -> 0-7 index)
    return (averages as number[])
      .map(v => blocks[Math.min(7, Math.floor(v / 12.5))])
      .join('');
  }

  public getCrabAge(): string {
    const ageMs = Date.now() - this.lifetimeStats.birthDate;
    const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));

    if (days >= 365) {
      const years = Math.floor(days / 365);
      return years === 1 ? '1 year' : `${years} years`;
    } else if (days >= 30) {
      const months = Math.floor(days / 30);
      return months === 1 ? '1 month' : `${months} months`;
    } else if (days >= 7) {
      const weeks = Math.floor(days / 7);
      return weeks === 1 ? '1 week' : `${weeks} weeks`;
    } else {
      return days === 1 ? '1 day' : `${days} days`;
    }
  }

  private startDecayTimer(): void {
    this.decayTimer = setInterval(() => {
      this.decayStats();
      this.checkEmotionExpiry();
    }, STAT_DECAY_INTERVAL);

    // Inactivity timer - check every 5 seconds
    this.inactivityTimer = setInterval(() => {
      this.checkInactivity();
      this.checkEmotionExpiry();
    }, INACTIVITY_CHECK_INTERVAL);
  }

  private checkInactivity(): void {
    const now = Date.now();
    const timeSinceActivity = now - this.lastActivity;

    // After 5 minutes of inactivity, go to tired/sleepy
    if (timeSinceActivity >= INACTIVITY_THRESHOLD && this.state.emotion !== 'tired') {
      this.state.emotion = 'tired';
      this.state.emotionExpiry = 0; // Stay tired until activity
      this.notifyChange();
    }
  }

  private resetActivity(): void {
    this.lastActivity = Date.now();
  }

  private decayStats(): void {
    const now = Date.now();
    const timeSinceActivity = now - this.lastActivity;
    const timeSinceLastDecay = now - this.lastDecay;
    const isSleeping = timeSinceActivity >= INACTIVITY_THRESHOLD;

    // Normal decay for hunger and happiness (1 interval only)
    this.state.stats.hunger = Math.max(0, this.state.stats.hunger - HUNGER_DECAY_RATE);

    // Extra happiness drain when hygiene is low
    const hygieneBonus = this.state.stats.hygiene < LOW_HYGIENE_THRESHOLD ? 1 : 0;
    this.state.stats.happiness = Math.max(0, this.state.stats.happiness - HAPPINESS_DECAY_RATE - hygieneBonus);

    // Detect computer sleep/suspend for energy recovery
    const missedIntervals = Math.floor(timeSinceLastDecay / STAT_DECAY_INTERVAL);

    // Recover energy while sleeping (apply all missed intervals if computer was suspended)
    // No passive energy drain - energy only depletes from actual Claude activity
    if (isSleeping || missedIntervals > 1) {
      const intervalsToApply = Math.max(1, missedIntervals);
      this.state.stats.energy = Math.min(100, this.state.stats.energy + ENERGY_RECOVERY_RATE * intervalsToApply);
    }

    this.lastDecay = now;
    this.capHappiness(); // Cap based on hygiene and energy
    this.state.stats.lastInteraction = now;

    // Force emotions based on low stats (don't reset activity - these are passive, not user-triggered)
    if (this.state.stats.hunger < 20) {
      this.setEmotion('hungry', EMOTION_DURATION, false);
    } else if (this.state.stats.energy < 20) {
      this.setEmotion('tired', EMOTION_DURATION, false);
    } else if (this.state.stats.happiness < 20) {
      this.setEmotion('sad', EMOTION_DURATION, false);
    }

    this.saveState();
    this.notifyChange();
  }

  private checkEmotionExpiry(): void {
    if (this.state.emotionExpiry > 0 && Date.now() > this.state.emotionExpiry) {
      this.state.emotion = this.getBaseEmotion();
      this.state.emotionExpiry = 0;
      this.notifyChange();
    }
  }

  private getBaseEmotion(): Emotion {
    // Only override neutral for critical stat levels
    if (this.state.stats.hunger < 20) return 'hungry';
    if (this.state.stats.energy < 20) return 'tired';
    if (this.state.stats.happiness < 20) return 'sad';
    return 'neutral';
  }

  public setEmotion(emotion: Emotion, duration: number = EMOTION_DURATION, resetActivity: boolean = true): void {
    if (resetActivity) {
      this.resetActivity(); // Reset inactivity timer on user-triggered emotion changes
    }
    this.state.emotion = emotion;
    this.state.emotionExpiry = Date.now() + duration;
    this.saveState();
    this.notifyChange();
  }

  public getState(): CrabState {
    return { ...this.state };
  }

  public onStateChange(callback: StateChangeCallback): void {
    this.callbacks.push(callback);
  }

  private notifyChange(): void {
    const stateCopy = this.getState();
    this.callbacks.forEach(cb => cb(stateCopy));
  }

  // Event handlers for different triggers
  public onSuccess(resetActivity: boolean = true): void {
    this.state.stats.happiness = Math.min(100, this.state.stats.happiness + 5);
    this.capHappiness();
    this.setEmotion('happy', EMOTION_DURATION, resetActivity);
  }

  public onMultipleSuccesses(): void {
    this.state.stats.happiness = Math.min(100, this.state.stats.happiness + 10);
    this.capHappiness();
    this.setEmotion('excited', 8000);
  }

  // Called when Claude is actively working (tool calls, etc.)
  public onActivity(): void {
    this.state.stats.energy = Math.max(0, this.state.stats.energy - ACTIVITY_ENERGY_DRAIN);
    this.capHappiness(); // Low energy caps happiness
  }

  // Called based on output token usage (drain = tokens / 5000, capped at 3)
  public onTokenUsage(drain: number): void {
    this.state.stats.energy = Math.max(0, this.state.stats.energy - drain);
    this.capHappiness(); // Low energy caps happiness
    this.saveState();
    this.notifyChange();
  }

  public onError(resetActivity: boolean = true): void {
    this.state.stats.happiness = Math.max(0, this.state.stats.happiness - 10);
    this.setEmotion('sad', EMOTION_DURATION, resetActivity);
  }

  public onRepeatedErrors(): void {
    this.state.stats.happiness = Math.max(0, this.state.stats.happiness - 20);
    this.setEmotion('angry', 8000);
  }

  public onThinking(resetActivity: boolean = true): void {
    this.setEmotion('thinking', 10000, resetActivity);
  }

  public onQuestion(): void {
    this.setEmotion('curious');
  }

  public onSurprise(): void {
    this.setEmotion('surprised');
  }

  public onLovestruck(): void {
    this.setEmotion('lovestruck', 8000);
  }

  public onClaudeFan(): void {
    this.setEmotion('claudeFan', 8000);
  }

  public onForcePush(username: string): void {
    this.state.customBubble = `USE THE FORCE,\n${username.toUpperCase()}!`;
    this.state.easterEggType = 'force';
    this.setEmotion('excited', 8000);
    // Clear custom bubble after emotion expires
    setTimeout(() => {
      this.state.customBubble = undefined;
      this.state.easterEggType = undefined;
      this.notifyChange();
    }, 8000);
  }

  public onCommit(branch: string): void {
    const now = new Date();
    const isFriday = now.getDay() === 5;
    const hour = now.getHours();
    const isFridayAfternoon = isFriday && hour >= 14; // Friday 2pm or later

    if (isFridayAfternoon) {
      this.state.customBubble = `FRIDAY DEPLOY?\nYOU BRAVE SOUL!`;
      this.state.easterEggType = 'friday';
    } else {
      this.state.customBubble = `ALL YOUR CODE ARE\nBELONG TO ${branch.toUpperCase()}`;
      this.state.easterEggType = 'commit';
    }
    this.setEmotion('happy', 6000);
    setTimeout(() => {
      this.state.customBubble = undefined;
      this.state.easterEggType = undefined;
      this.notifyChange();
    }, 6000);
  }

  // Random value between min and max (inclusive)
  private randomRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Cap happiness based on current hygiene and energy levels
  private capHappiness(): void {
    const maxHappiness = getMaxHappiness(this.state.stats.hygiene, this.state.stats.energy);
    this.state.stats.happiness = Math.min(this.state.stats.happiness, maxHappiness);
  }

  // Manual interactions
  // Returns: 'normal' | 'overfed' | 'stuffed'
  public feed(): 'normal' | 'overfed' | 'stuffed' {
    // Stuffed: hunger >= 91, refuse food
    if (this.state.stats.hunger >= 91) {
      return 'stuffed';
    }

    // Add food
    const foodAmount = this.randomRange(5, 15);
    this.state.stats.hunger = Math.min(100, this.state.stats.hunger + foodAmount);
    this.state.stats.lastFed = Date.now();

    // Overfed: hunger was > 70, causes poop
    if (this.state.stats.hunger > 70) {
      this.state.stats.poopCount++;
      this.state.stats.hygiene = Math.max(0, this.state.stats.hygiene - POOP_HYGIENE_PENALTY);
      this.capHappiness(); // Immediately cap happiness when hygiene drops
      this.setEmotion('happy');
      this.saveState();
      return 'overfed';
    }

    // Normal feed
    this.setEmotion('happy');
    this.saveState();
    return 'normal';
  }

  public pet(): void {
    this.state.stats.happiness = Math.min(100, this.state.stats.happiness + this.randomRange(5, 15));
    this.capHappiness();
    this.setEmotion('excited');
    this.saveState();
  }

  public clean(): void {
    this.state.stats.poopCount = 0;
    this.state.stats.hygiene = 100;
    this.state.stats.happiness = Math.min(100, this.state.stats.happiness + 5); // Happy to be clean!
    // No need to cap - hygiene is now 100
    this.setEmotion('happy');
    this.saveState();
  }

  // Scrub: clean 10 hygiene points, returns true if now fully clean
  public scrub(): boolean {
    this.state.stats.hygiene = Math.min(100, this.state.stats.hygiene + 10);
    if (this.state.stats.hygiene >= 100) {
      this.state.stats.poopCount = 0;
      this.state.stats.happiness = Math.min(100, this.state.stats.happiness + 5);
      this.setEmotion('happy');
    }
    // Happiness cap may have increased with hygiene - no need to cap here
    this.saveState();
    this.notifyChange();
    return this.state.stats.hygiene >= 100;
  }

  public addPoop(): void {
    this.state.stats.poopCount++;
    this.state.stats.hygiene = Math.max(0, this.state.stats.hygiene - POOP_HYGIENE_PENALTY);
    this.capHappiness(); // Immediately cap happiness when hygiene drops
    this.saveState();
    this.notifyChange();
  }

  public onKonamiCode(): void {
    // Secret code: boost energy to 80%
    this.state.stats.energy = Math.max(this.state.stats.energy, 80);
    this.setEmotion('excited', 3000);
    this.saveState();
    this.notifyChange();
  }

  private scheduleRandomPoop(): void {
    // Random time between 45-60 minutes
    const delay = POOP_TIMER_MIN + Math.random() * (POOP_TIMER_MAX - POOP_TIMER_MIN);
    this.poopTimer = setTimeout(() => {
      this.addPoop();
      this.scheduleRandomPoop(); // Schedule next poop
    }, delay);
  }

  public dispose(): void {
    if (this.decayTimer) {
      clearInterval(this.decayTimer);
    }
    if (this.inactivityTimer) {
      clearInterval(this.inactivityTimer);
    }
    if (this.poopTimer) {
      clearTimeout(this.poopTimer);
    }
    if (this.wellbeingTimer) {
      clearInterval(this.wellbeingTimer);
    }
    this.saveState();
    this.saveLifetimeStats();
  }
}
