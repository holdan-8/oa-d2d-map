// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false, // SPA mode – required for GitHub Pages static hosting

  devtools: { enabled: false },

  modules: ['@nuxtjs/tailwindcss'],

  css: ['~/assets/css/main.css'],

  app: {
    // Set BASE_URL env var to '/repo-name/' when deploying to GitHub Pages
    baseURL: process.env.BASE_URL || '/',
    head: {
      title: 'D2D Aktionskarte Bern',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Tür-zu-Tür Aktionskarte für die Region Bern – Door-to-door action map for the Bern region'
        }
      ],
      link: [
        {
          rel: 'icon',
          type: 'image/svg+xml',
          href: '/favicon.svg'
        }
      ]
    }
  },

  typescript: {
    strict: false
  }
})
