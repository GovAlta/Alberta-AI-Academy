<script setup>
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

defineProps({
  isGenerating: { type: Boolean, default: false },
  hasError: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
  isFallback: { type: Boolean, default: false }
})

defineEmits(['generate'])
</script>

<template>
  <div class="dl-cta">
    <p class="dl-cta__text">{{ t('download.ready') }}</p>

    <button
      class="btn btn--primary dl-cta__btn"
      :disabled="isGenerating"
      :aria-label="t('download.generate')"
      @click="$emit('generate')"
    >
      <span v-if="isGenerating" class="spinner dl-cta__spinner" aria-hidden="true" />
      <span>{{ isGenerating ? t('download.generating') : t('download.generate') }}</span>
    </button>

    <p v-if="hasError" class="dl-cta__error" role="alert">
      {{ errorMessage || t('download.failed') }}
    </p>
    <p v-else-if="isFallback" class="dl-cta__warning" role="status">
      {{ t('download.fallback') }}
    </p>
    <p v-else class="dl-cta__note">{{ t('download.note') }}</p>
  </div>
</template>

<style scoped>
.dl-cta {
  flex-shrink: 0;
  padding: var(--goa-space-m) var(--goa-space-l);
  background: var(--goa-color-success-background);
  border-top: var(--goa-border-width-s) solid var(--goa-color-greyscale-200);
  display: flex;
  flex-direction: column;
  gap: var(--goa-space-s);
  align-items: flex-start;
}

.dl-cta__text {
  font-size: var(--goa-font-size-3);
  font-weight: var(--goa-font-weight-medium);
  color: var(--goa-color-success-default);
  margin: 0;
}

.dl-cta__btn {
  background: var(--goa-color-success-default);
  border-color: var(--goa-color-success-default);
  display: flex;
  align-items: center;
  gap: var(--goa-space-xs);
}

.dl-cta__btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.dl-cta__spinner {
  width: 1em;
  height: 1em;
  flex-shrink: 0;
  color: currentColor;
}

.dl-cta__note {
  font-size: var(--goa-font-size-1);
  color: var(--goa-color-text-secondary);
  margin: 0;
}

.dl-cta__error {
  font-size: var(--goa-font-size-2);
  color: var(--goa-color-emergency-default);
  margin: 0;
}

.dl-cta__warning {
  font-size: var(--goa-font-size-2);
  color: var(--goa-color-warning-default);
  margin: 0;
}
</style>
