import * as vscode from 'vscode';
import { Emotion } from './ascii/crabArt';

export interface CrabStats {
  hunger: number;    // 0-100, decreases over time
  happiness: number; // 0-100, affected by events
  energy: number;    // 0-100, depletes during sessions
  lastFed: number;   // timestamp
  lastInteraction: number; // timestamp
}

export interface CrabState {
  emotion: Emotion;
  stats: CrabStats;
  emotionExpiry: number; // timestamp when emotion should decay
}

type StateChangeCallback = (state: CrabState) => void;

const STAT_DECAY_INTERVAL = 60000; // 1 minute
const EMOTION_DURATION = 10000; // 10 seconds before decaying to neutral
const HUNGER_DECAY_RATE = 2;
const HAPPINESS_DECAY_RATE = 1;
const ENERGY_DECAY_RATE = 1;
const ACTIVITY_ENERGY_DRAIN = 1; // Energy drain per Claude activity
const INACTIVITY_CHECK_INTERVAL = 5000; // Check every 5 seconds
const INACTIVITY_THRESHOLD = 300000; // 5 minutes of inactivity → sleepy

export class CrabStateManager {
  private state: CrabState;
  private context: vscode.ExtensionContext;
  private decayTimer: NodeJS.Timeout | null = null;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();
  private callbacks: StateChangeCallback[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.state = this.loadState();
    this.startDecayTimer();
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
        lastFed: Date.now(),
        lastInteraction: Date.now()
      },
      emotionExpiry: 0
    };
  }

  private saveState(): void {
    this.context.globalState.update('crabState', this.state);
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
    this.state.stats.hunger = Math.max(0, this.state.stats.hunger - HUNGER_DECAY_RATE);
    this.state.stats.happiness = Math.max(0, this.state.stats.happiness - HAPPINESS_DECAY_RATE);
    this.state.stats.energy = Math.max(0, this.state.stats.energy - ENERGY_DECAY_RATE);
    this.state.stats.lastInteraction = Date.now();

    // Force emotions based on low stats
    if (this.state.stats.hunger < 20) {
      this.setEmotion('hungry');
    } else if (this.state.stats.energy < 20) {
      this.setEmotion('tired');
    } else if (this.state.stats.happiness < 20) {
      this.setEmotion('sad');
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

  public setEmotion(emotion: Emotion, duration: number = EMOTION_DURATION): void {
    this.resetActivity(); // Reset inactivity timer on any emotion change
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
  public onSuccess(): void {
    this.state.stats.happiness = Math.min(100, this.state.stats.happiness + 5);
    this.setEmotion('happy');
  }

  public onMultipleSuccesses(): void {
    this.state.stats.happiness = Math.min(100, this.state.stats.happiness + 10);
    this.setEmotion('excited', 8000);
  }

  // Called when Claude is actively working (tool calls, etc.)
  public onActivity(): void {
    this.state.stats.energy = Math.max(0, this.state.stats.energy - ACTIVITY_ENERGY_DRAIN);
  }

  public onError(): void {
    this.state.stats.happiness = Math.max(0, this.state.stats.happiness - 10);
    this.setEmotion('sad');
  }

  public onRepeatedErrors(): void {
    this.state.stats.happiness = Math.max(0, this.state.stats.happiness - 20);
    this.setEmotion('angry', 8000);
  }

  public onThinking(): void {
    this.setEmotion('thinking', 10000);
  }

  public onQuestion(): void {
    this.setEmotion('curious');
  }

  public onSurprise(): void {
    this.setEmotion('surprised');
  }

  public onLongSession(): void {
    this.state.stats.energy = Math.max(0, this.state.stats.energy - 15);
    if (this.state.stats.energy < 30) {
      this.setEmotion('tired', 10000);
    }
  }

  // Manual interactions
  public feed(): void {
    this.state.stats.hunger = Math.min(100, this.state.stats.hunger + 30);
    this.state.stats.lastFed = Date.now();
    this.setEmotion('happy');
    this.saveState();
  }

  public pet(): void {
    this.state.stats.happiness = Math.min(100, this.state.stats.happiness + 10);
    this.state.stats.energy = Math.min(100, this.state.stats.energy + 10); // Petting wakes up the crab!
    this.setEmotion('excited');
    this.saveState();
  }

  public dispose(): void {
    if (this.decayTimer) {
      clearInterval(this.decayTimer);
    }
    if (this.inactivityTimer) {
      clearInterval(this.inactivityTimer);
    }
    this.saveState();
  }
}
