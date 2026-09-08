/**
 * Format a minutes value (can be fractional) as a zero-padded
 * HH:MM:SS clock string. Callers historically pass minutes —
 * we convert to whole seconds internally. 0 still renders as
 * `00:00:00` so grids never show a flash of `NaN`/blank.
 */
export function formatMinutes(value: number): string {
  if (!Number.isFinite(value)) {
    return '\u2014';
  }
  const totalSeconds = Math.max(0, Math.round(value * 60));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':');
}

export function formatStreakDays(value: number): string {
  return value === 1 ? '1 Day' : `${value} Days`;
}

export function formatWeekday(dateKey: string): string {
  if (!dateKey || dateKey === '\u2014') {
    return '\u2014';
  }
  const date = new Date(`${dateKey}T00:00:00`);
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return labels[date.getDay()] ?? '\u2014';
}

export function formatSignedPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return '0%';
  }
  if (value > 0) {
    return `+${value}%`;
  }
  return `${value}%`;
}

export function formatSignedNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

export function formatDate(isoDate: string | null): string {
  if (!isoDate) {
    return '--';
  }
  const dateStr = isoDate.length > 10 ? isoDate.slice(0, 10) : isoDate;
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function formatSecondsAsClock(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '00:00';
  }
  const total = Math.round(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
