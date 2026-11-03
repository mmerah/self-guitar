import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import svelteConfig from './svelte.config.js';

export default ts.config(
	{
		ignores: [
			'build/',
			'build-demo/',
			'.svelte-kit/',
			'static/',
			'data/',
			'test-results/',
			'playwright-report/'
		]
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{ languageOptions: { globals: { ...globals.browser, ...globals.node } } },
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: { parser: ts.parser, extraFileExtensions: ['.svelte'], svelteConfig }
		}
	},
	{
		rules: {
			'svelte/no-navigation-without-resolve': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ varsIgnorePattern: '^_', argsIgnorePattern: '^_' }
			]
		}
	},
	{
		// Shared by the server and the in-browser demo: no Node, no native driver, no server code.
		files: ['src/lib/core/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: ['better-sqlite3', 'fs', 'path'].map((name) => ({
						name,
						message: 'src/lib/core runs in the browser too (the demo).'
					})),
					patterns: [
						{
							group: ['node:*', 'better-sqlite3/*', '$lib/server', '$lib/server/*', '**/server/*'],
							message: 'src/lib/core runs in the browser too (the demo).'
						}
					]
				}
			]
		}
	}
);
