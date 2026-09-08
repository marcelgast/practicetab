export function toAlphaContentPosition(
  click: { x: number; y: number },
  scroll: { left: number; top: number },
): { x: number; y: number } {
  return {
    x: click.x + scroll.left,
    y: click.y + scroll.top,
  };
}
