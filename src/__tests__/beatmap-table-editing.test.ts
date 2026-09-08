import { describe, expect, it } from 'vitest';
import { useBeatmapTableEditing } from '../components/player/useBeatmapTableEditing';

describe('useBeatmapTableEditing', () => {
  it('starts with no cell editing', () => {
    const { editingCell } = useBeatmapTableEditing();
    expect(editingCell.value).toBeNull();
  });

  it('startEditing sets the correct cell', () => {
    const { editingCell, startEditing } = useBeatmapTableEditing();
    startEditing('time', 2, 'bpm');
    expect(editingCell.value).toEqual({ kind: 'time', index: 2, field: 'bpm' });
  });

  it('isEditing returns true only for the active cell', () => {
    const { isEditing, startEditing } = useBeatmapTableEditing();
    startEditing('loop', 0, 'start');
    expect(isEditing('loop', 0, 'start')).toBe(true);
    expect(isEditing('loop', 0, 'end')).toBe(false);
    expect(isEditing('time', 0, 'start')).toBe(false);
  });

  it('commitEdit clears the editing state', () => {
    const { editingCell, startEditing, commitEdit } = useBeatmapTableEditing();
    startEditing('time', 1, 'bar');
    commitEdit();
    expect(editingCell.value).toBeNull();
  });

  it('cancelEdit clears the editing state', () => {
    const { editingCell, startEditing, cancelEdit } = useBeatmapTableEditing();
    startEditing('time', 0, 'bpm');
    cancelEdit();
    expect(editingCell.value).toBeNull();
  });

  it('only one cell is editable at a time', () => {
    const { editingCell, startEditing } = useBeatmapTableEditing();
    startEditing('time', 0, 'bpm');
    startEditing('loop', 1, 'start');
    expect(editingCell.value).toEqual({
      kind: 'loop',
      index: 1,
      field: 'start',
    });
  });
});
