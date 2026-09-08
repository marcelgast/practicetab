// @vitest-environment happy-dom
/* eslint-disable vue/one-component-per-file */
import { describe, expect, it } from 'vitest';
import { createApp, defineComponent } from 'vue';
import BaseButton from '../components/ui/BaseButton.vue';

const TestButton = defineComponent({
  components: { BaseButton },
  props: {
    variant: { type: String, default: 'ghost' },
    label: { type: String, default: 'Button' },
  },
  template: '<BaseButton :variant="variant">{{ label }}</BaseButton>',
});

describe('BaseButton', () => {
  it('applies outline-danger variant class', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp(TestButton, {
      variant: 'outline-danger',
      label: 'Remove',
    }).mount(host);

    const button = host.querySelector('button');
    expect(button?.className ?? '').toContain('outline-danger');
  });

  it('applies filled-accent variant class', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp(TestButton, {
      variant: 'filled-accent',
      label: '+',
    }).mount(host);

    const button = host.querySelector('button');
    expect(button?.className ?? '').toContain('filled-accent');
  });
});
