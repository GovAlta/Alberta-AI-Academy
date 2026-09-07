<script setup>
import { RouterView, useRoute } from 'vue-router'
import AiAssistantPanel from '@/components/features/AiAssistantPanel.vue'
import ContentDetailModal from '@/components/features/ContentDetailModal.vue'
import { useContentStore } from '@/stores/content.js'

const route = useRoute()
const contentStore = useContentStore()
</script>

<template>
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <RouterView />
  <!-- Hide the FAB panel on the dedicated /chat page — it has its own full interface -->
  <AiAssistantPanel v-if="route.name !== 'chat'" />
  <!-- Global content detail modal — openable from AI chat links or anywhere -->
  <ContentDetailModal
    :item="contentStore.modalItem"
    :level-colour="contentStore.modalLevelColour || 'var(--goa-color-brand-default)'"
    @close="contentStore.closeItemModal()"
  />
</template>
