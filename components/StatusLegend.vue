<script setup lang="ts">
import { STATUS_META } from '~/composables/useActionStore'
</script>

<template>
  <div class="bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-2 border border-gray-200 text-xs">
    <p class="font-semibold text-gray-700 mb-1.5">Legende</p>
    <div class="space-y-1">
      <div
        v-for="(meta, status) in STATUS_META"
        :key="status"
        class="flex items-center gap-1.5"
      >
        <span
          class="w-3.5 h-3.5 rounded-sm flex-shrink-0 border"
          :style="{
            background: meta.fillColor,
            borderColor: meta.color
          }"
        />
        <span class="text-gray-600">{{ meta.label }}</span>
      </div>
    </div>
  </div>
</template>
