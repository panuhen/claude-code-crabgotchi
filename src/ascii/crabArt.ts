export type Emotion =
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'curious'
  | 'thinking'
  | 'sad'
  | 'tired'
  | 'hungry'
  | 'angry'
  | 'surprised'
  | 'lovestruck'
  | 'claudeFan';

export interface CrabFrame {
  art: string[];  // Changed to array of lines for individual centering
  bubble?: string;
}

// Original Unicode block crab - each line separate for alignment
// Based on Claude Code icon

export const crabFrames: Record<Emotion, CrabFrame[]> = {
  neutral: [
    {
      art: [
        '  ████████',
        '  █▌▐██▌▐█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ]
    },
    {
      art: [
        '  ████████',
        '  █▌▐██▌▐█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ]
    }
  ],

  happy: [
    {
      art: [
        '  ████████',
        '  █▛ ▜▛ ▜█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: '♪'
    },
    {
      art: [
        '  ████████',
        '  █▛ ▜▛ ▜█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: '♫'
    }
  ],

  excited: [
    {
      art: [
        '  ████████',
        ' █ █▛ ▜▛ ▜█ █',
        '  ██████████',
        '  ████████',
        '  ▐▐      ▌▌'
      ],
      bubble: '!'
    },
    {
      art: [
        '  ████████',
        '   █ █▛ ▜▛ ▜█ █',
        '  ██████████',
        '  ████████',
        '  ▐▐      ▌▌'
      ],
      bubble: '!!'
    }
  ],

  curious: [
    {
      art: [
        '  █████▀▀█',
        '  █▌▐██▌▐█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: '?'
    },
    {
      art: [
        '  █████▀▀█',
        '  █▌▐██▌▐█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: '??'
    }
  ],

  thinking: [
    {
      art: [
        '  ████████',
        '  █▛▜██▛▜█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: '.'
    },
    {
      art: [
        '  ████████',
        '  █▛▜██▛▜█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: '..'
    },
    {
      art: [
        '  ████████',
        '  █▛▜██▛▜█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: '...'
    }
  ],

  sad: [
    {
      art: [
        '  ████████',
        '  █▀▄▄▀▄▄█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: '...'
    },
    {
      art: [
        '  ████████',
        '  █▀▄▄▀▄▄█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: ','
    }
  ],

  tired: [
    {
      art: [
        '  ████████',
        '  █▀▀▀▀▀▀█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: 'z'
    },
    {
      art: [
        '  ████████',
        '  █▀▀▀▀▀▀█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: 'zz'
    },
    {
      art: [
        '  ████████',
        '  █▀▀▀▀▀▀█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: 'zzz'
    }
  ],

  hungry: [
    {
      art: [
        '  ████████',
        '  █▌ ██ ▐█',
        '  ████████████',
        '  ███▙▟███',
        '  ▐▐  ▌▌'
      ],
      bubble: 'nom?'
    },
    {
      art: [
        '  ████████',
        '  █▌ ██ ▐█',
        '  ████████████',
        '  ███▙▟███',
        '  ▐▐  ▌▌'
      ],
      bubble: 'nom?'
    }
  ],

  angry: [
    {
      art: [
        '  ████████',
        '  █▝▀██▀▘█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: '!'
    },
    {
      art: [
        '  ████████',
        '  █▝▀██▀▘█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: '#!'
    }
  ],

  surprised: [
    {
      art: [
        '  ████████',
        '  █▌▐██▌▐█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: '!'
    },
    {
      art: [
        '  ████████',
        '  █ █▌▐██▌▐█ █',
        '  ██████████',
        '  ████████',
        '  ▐▐      ▌▌'
      ],
      bubble: '!?'
    }
  ],

  lovestruck: [
    {
      art: [
        '  ████████',
        '  █▄ ██ ▄█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: '♥'
    },
    {
      art: [
        '  ████████',
        '  █▄ ██ ▄█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: '♡'
    }
  ],

  claudeFan: [
    {
      art: [
        '  ████████',
        '  █▄ ██ ▄█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: '♥'
    },
    {
      art: [
        '  ████████',
        '  █▄ ██ ▄█',
        '  ████████████',
        '  ████████',
        '  ▐▐  ▌▌'
      ],
      bubble: '♡'
    }
  ]
};

export function getEmotionFrames(emotion: Emotion): CrabFrame[] {
  return crabFrames[emotion] || crabFrames.neutral;
}

export const emotionLabels: Record<Emotion, string> = {
  neutral: 'Chillin\'',
  happy: 'Happy!',
  excited: 'EXCITED!!',
  curious: 'Curious...',
  thinking: 'Thinking...',
  sad: 'Sad...',
  tired: 'Sleepy...',
  hungry: 'Hungry!',
  angry: 'Frustrated!',
  surprised: 'WHOAH!',
  lovestruck: 'Ferris! ♥',
  claudeFan: 'Claude! ♥'
};
