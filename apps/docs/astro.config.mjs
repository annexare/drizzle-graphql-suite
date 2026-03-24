import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://graphql-suite.annexare.com',
  integrations: [
    starlight({
      title: 'GraphQL Suite',
      components: {
        Footer: './src/components/Footer.astro',
      },
      description:
        'Auto-generated GraphQL CRUD, type-safe clients, and React Query hooks from Drizzle PostgreSQL schemas',
      head: [
        {
          tag: 'link',
          attrs: {
            rel: 'alternate',
            type: 'text/plain',
            href: '/llms.txt',
            title: 'LLM-friendly documentation',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'alternate',
            type: 'text/plain',
            href: '/llms-full.txt',
            title: 'LLM-friendly full documentation',
          },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:type', content: 'website' },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:site_name',
            content: 'GraphQL Suite',
          },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:card', content: 'summary' },
        },
      ],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/annexare/graphql-suite',
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Schema Package',
          autogenerate: { directory: 'schema' },
        },
        {
          label: 'Client Package',
          autogenerate: { directory: 'client' },
        },
        {
          label: 'Query Package',
          autogenerate: { directory: 'query' },
        },
        {
          label: 'Guides',
          autogenerate: { directory: 'guides' },
        },
        {
          label: 'API Reference',
          autogenerate: { directory: 'reference' },
        },
      ],
    }),
  ],
})
