export const PLAYER_PANEL_BREAKPOINT = 900;

export function isSmallScreen(width?: number): boolean {
  const targetWidth =
    typeof width === 'number'
      ? width
      : typeof window !== 'undefined'
        ? window.innerWidth
        : PLAYER_PANEL_BREAKPOINT;
  return targetWidth < PLAYER_PANEL_BREAKPOINT;
}
