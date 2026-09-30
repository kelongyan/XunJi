<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useUiStore } from './stores/ui'
import InkTransition from './components/common/InkTransition.vue'

const ui = useUiStore()

onMounted(() => {
  ui.initMode()
})
</script>

<template>
  <RouterView v-slot="{ Component }">
    <Transition name="page" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
  <InkTransition />
</template>
