export type ShortcutScope = 'global' | 'player';

export type Shortcut = {
  keys: string;
  description: string;
  scope?: ShortcutScope;
};

export function getImplementedShortcuts(): Shortcut[] {
  return [
    {
      keys: 'Space',
      description: 'Play/Pause',
      scope: 'global',
    },
    {
      keys: 'S / Esc',
      description: 'Stop and reset to Start',
      scope: 'global',
    },
    {
      keys: 'L',
      description: 'Toggle Listen Mode (Track Selector)',
      scope: 'player',
    },
    {
      keys: 'T',
      description: 'Start/Pause Practice Timer',
      scope: 'global',
    },
    {
      keys: 'F1',
      description: 'Open Help Menu',
      scope: 'global',
    },
  ];
}
