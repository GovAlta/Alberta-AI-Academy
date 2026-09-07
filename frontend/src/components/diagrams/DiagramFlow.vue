<script setup>
import { ref } from 'vue'
import { VueFlow } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'

defineProps({
  nodes: Array,
  edges: Array,
  title: String,
})

const expanded = ref(false)

function openModal() { expanded.value = true }
function closeModal() { expanded.value = false }
</script>

<template>
  <!-- Compact diagram in card -->
  <div class="flow-wrapper">
    <div role="img" :aria-label="title ? `Diagram: ${title}` : 'Concept flowchart diagram'">
      <VueFlow
        :nodes="nodes"
        :edges="edges"
        :nodes-draggable="false"
        :nodes-connectable="false"
        :elements-selectable="false"
        :zoom-on-scroll="false"
        :pan-on-drag="false"
        :pan-on-scroll="false"
        fit-view-on-init
        class="flow-canvas"
        aria-hidden="true"
      />
    </div>
    <button class="flow-expand-btn" @click="openModal" :aria-label="title ? `Expand diagram: ${title}` : 'Expand diagram'">
      <span aria-hidden="true">⛶</span> Expand
    </button>
  </div>

  <!-- Fullscreen modal -->
  <Teleport to="body">
    <div v-if="expanded" class="flow-modal-overlay" role="dialog" aria-modal="true" :aria-label="title || 'Diagram'" @click.self="closeModal" @keydown.escape="closeModal">
      <div class="flow-modal">
        <div class="flow-modal__header">
          <h3 class="flow-modal__title">{{ title }}</h3>
          <button class="flow-modal__close" @click="closeModal" aria-label="Close diagram" autofocus>✕</button>
        </div>
        <div class="flow-modal__body">
          <VueFlow
            :nodes="nodes"
            :edges="edges"
            :nodes-draggable="false"
            :nodes-connectable="false"
            :elements-selectable="false"
            :zoom-on-scroll="true"
            :pan-on-drag="true"
            fit-view-on-init
            class="flow-canvas--modal"
          />
        </div>
        <p class="flow-modal__hint">Scroll to zoom · drag to pan</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.flow-wrapper {
  position: relative;
  background: var(--goa-color-greyscale-50);
  border-radius: var(--goa-border-radius-l);
  overflow: hidden;
}

.flow-canvas {
  height: 240px;
  width: 100%;
}

/* Override Vue Flow background */
:deep(.vue-flow__renderer) {
  background: transparent;
}
:deep(.vue-flow__background) {
  display: none;
}
:deep(.vue-flow) {
  background: transparent;
}

.flow-expand-btn {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(255,255,255,0.92);
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: background 0.15s;
  z-index: 10;
}

.flow-expand-btn:hover {
  background: #fff;
  border-color: #9ca3af;
}

/* Modal */
.flow-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.flow-modal {
  background: #fff;
  border-radius: 12px;
  width: 100%;
  max-width: 900px;
  box-shadow: 0 25px 60px rgba(0,0,0,0.3);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.flow-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.flow-modal__title {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
  margin: 0;
}

.flow-modal__close {
  background: none;
  border: none;
  font-size: 18px;
  color: #6b7280;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  line-height: 1;
}

.flow-modal__close:hover {
  background: #f3f4f6;
  color: #111827;
}

.flow-canvas--modal {
  height: 500px;
  width: 100%;
}

:deep(.flow-canvas--modal .vue-flow) {
  background: #f9fafb;
}

.flow-modal__hint {
  text-align: center;
  font-size: 11px;
  color: #9ca3af;
  padding: 8px;
  margin: 0;
  border-top: 1px solid #f3f4f6;
}
</style>
