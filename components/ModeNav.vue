<script setup lang="ts">
const route = useRoute()
const currentMode = computed(() => route.path.includes('/action') ? 'action' : 'planning')
</script>

<template>
    <nav class="flex items-center gap-1 bg-gray-50 border-b border-gray-200 px-3 py-1.5 flex-shrink-0">
        <NuxtLink to="/planning" :class="[
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            currentMode === 'planning'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-200'
        ]">
            Planung
        </NuxtLink>
        <NuxtLink to="/action" :class="[
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            currentMode === 'action'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-200'
        ]">
            Aktion
        </NuxtLink>
        <div class="flex-1" />
        <span class="text-xs text-gray-400 hidden sm:block">D2D Aktionskarte Bern</span>
    </nav>
</template>
