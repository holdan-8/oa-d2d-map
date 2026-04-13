<script setup lang="ts">
import { useBernData } from '~/composables/useBernData'

const { loading, error, quartiere, fetchBernData } = useBernData()

onMounted(() => {
    fetchBernData()
})

const selectedId = ref<string | null>(null)
const selectedName = ref<string>('')
const mobilePanelOpen = ref(false)

function handleSelect(id: string, name: string): void {
    selectedId.value = id
    selectedName.value = name
    mobilePanelOpen.value = true
}

function handleClose(): void {
    selectedId.value = null
    mobilePanelOpen.value = false
}
</script>

<template>
    <div class="flex flex-col h-screen w-screen overflow-hidden bg-gray-100">
        <ModeNav />

        <div class="flex flex-col md:flex-row flex-1 min-h-0">
            <!-- Map area -->
            <div class="relative flex-1 min-h-0">
                <ClientOnly>
                    <LeafletMap :quartiere="quartiere" :selected-id="selectedId" mode="planning" class="w-full h-full"
                        @select="handleSelect" />
                    <template #fallback>
                        <div class="w-full h-full flex items-center justify-center bg-gray-200 text-gray-500 text-sm">
                            Karte wird geladen…
                        </div>
                    </template>
                </ClientOnly>

                <!-- Legend -->
                <div class="absolute bottom-20 left-2 z-[1000] hidden md:block">
                    <StatusLegend />
                </div>

                <!-- Mobile: open panel button -->
                <button
                    class="absolute bottom-4 right-4 z-[1000] md:hidden flex items-center gap-2 bg-white shadow-lg rounded-full px-4 py-2.5 text-sm font-semibold text-gray-700 border border-gray-200 active:bg-gray-50"
                    @click="mobilePanelOpen = !mobilePanelOpen">
                    Planung
                </button>

                <!-- Loading overlay -->
                <div v-if="loading"
                    class="absolute inset-0 z-[999] bg-white/60 backdrop-blur-sm flex items-center justify-center">
                    <div class="bg-white rounded-xl shadow-lg px-6 py-4 flex items-center gap-3 text-sm text-gray-700">
                        <svg class="spinner w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <path
                                d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                        </svg>
                        Quartiersdaten werden geladen…
                    </div>
                </div>
            </div>

            <!-- Side panel – desktop -->
            <div class="hidden md:flex flex-col w-80 xl:w-96 flex-shrink-0 border-l border-gray-200 shadow-xl">
                <PlanningPanel :quartiere="quartiere" :selected-id="selectedId" :loading="loading" :error="error"
                    @select="handleSelect" @close="handleClose" />
            </div>
        </div>

        <!-- Bottom sheet – mobile -->
        <Transition name="slide-up">
            <div v-if="mobilePanelOpen"
                class="md:hidden fixed inset-x-0 bottom-0 z-[2000] flex flex-col bg-white rounded-t-2xl shadow-2xl"
                style="max-height: 75vh">
                <div class="flex justify-center pt-2 pb-1 flex-shrink-0">
                    <div class="w-10 h-1 bg-gray-300 rounded-full" />
                </div>
                <PlanningPanel :quartiere="quartiere" :selected-id="selectedId" :loading="loading" :error="error"
                    class="flex-1 min-h-0" @select="handleSelect" @close="handleClose" />
            </div>
        </Transition>

        <!-- Mobile backdrop -->
        <Transition name="fade">
            <div v-if="mobilePanelOpen" class="md:hidden fixed inset-0 z-[1999] bg-black/30"
                @click="mobilePanelOpen = false" />
        </Transition>
    </div>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
    transition: transform 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
    transform: translateY(100%);
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
