<script setup lang="ts">
import { useUiStore } from '../../stores/ui'
import SealStamp from './SealStamp.vue'

const ui = useUiStore()
</script>

<template>
  <Teleport to="body">
    <Transition name="ink-flash">
      <div v-if="ui.inkFlashActive" class="ink-flash-overlay" aria-hidden="true">
        <SealStamp :text="ui.inkFlashText" class="ink-flash-stamp" />
      </div>
    </Transition>
  </Teleport>
</template>
