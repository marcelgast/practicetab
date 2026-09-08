import { nextTick, ref, type Ref } from 'vue';

export type EditingCell = {
  kind: 'time' | 'loop';
  index: number;
  field: string;
};

type UseBeatmapTableEditing = {
  editingCell: Ref<EditingCell | null>;
  isEditing: (kind: 'time' | 'loop', index: number, field: string) => boolean;
  startEditing: (kind: 'time' | 'loop', index: number, field: string) => void;
  commitEdit: () => void;
  cancelEdit: () => void;
  handleCellClick: (
    kind: 'time' | 'loop',
    index: number,
    field: string,
    event: MouseEvent,
  ) => void;
  handleCellBlur: (event: FocusEvent) => void;
  handleCellKeydown: (event: KeyboardEvent) => void;
};

export function useBeatmapTableEditing(): UseBeatmapTableEditing {
  const editingCell = ref<EditingCell | null>(null);

  function isEditing(
    kind: 'time' | 'loop',
    index: number,
    field: string,
  ): boolean {
    const c = editingCell.value;
    return (
      c !== null && c.kind === kind && c.index === index && c.field === field
    );
  }

  function startEditing(
    kind: 'time' | 'loop',
    index: number,
    field: string,
  ): void {
    editingCell.value = { kind, index, field };
  }

  function commitEdit(): void {
    editingCell.value = null;
  }

  function cancelEdit(): void {
    editingCell.value = null;
  }

  function handleCellClick(
    kind: 'time' | 'loop',
    index: number,
    field: string,
    event: MouseEvent,
  ): void {
    startEditing(kind, index, field);
    const cell = (event.currentTarget as HTMLElement) ?? null;
    void nextTick(() => {
      const input = cell?.querySelector('input') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  function handleCellBlur(event: FocusEvent): void {
    const related = event.relatedTarget as HTMLElement | null;
    const cell = (event.target as HTMLElement)?.closest('.bm-cell');
    if (cell && related && cell.contains(related)) {
      return;
    }
    commitEdit();
  }

  function handleCellKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      commitEdit();
    } else if (event.key === 'Escape') {
      cancelEdit();
    }
  }

  return {
    editingCell,
    isEditing,
    startEditing,
    commitEdit,
    cancelEdit,
    handleCellClick,
    handleCellBlur,
    handleCellKeydown,
  };
}
