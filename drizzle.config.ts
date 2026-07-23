import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	schema: './src/worker/db/schema.ts',
	out: './infra/cloudflare/migrations',
	dialect: 'sqlite',
})
