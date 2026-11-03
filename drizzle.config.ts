import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/core/db/schema.ts',
	out: './drizzle'
});
