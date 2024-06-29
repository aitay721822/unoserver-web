import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
// @ts-expect-error no types for now
import eslintPluginImport from 'eslint-plugin-import'
import eslintPluginUnicorn from 'eslint-plugin-unicorn'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const esm = tseslint.config({
	files: ['**/*.ts?(x)', '**/*.js?(x)'],
	rules: {
		'import/extensions': ['error', 'ignorePackages'],
		'import/no-useless-path-segments': ['warn', { noUselessIndex: false }],
		'unicorn/prefer-module': 'error',
		'unicorn/prefer-top-level-await': 'warn',
	},
})

const eslintConfig = tseslint.config(
	js.configs.recommended,
	eslintPluginImport.flatConfigs.recommended,
	eslintPluginImport.flatConfigs.errors,
	eslintPluginImport.flatConfigs.warnings,
	eslintPluginUnicorn.configs['recommended'],
	{
		rules: {
			'dot-notation': 'warn',
			'eqeqeq': ['warn', 'smart'],
			'func-names': ['warn', 'never'],
			'global-require': 'warn',
			'guard-for-in': 'error',
			'import/newline-after-import': 'warn',
			'import/no-extraneous-dependencies': 'error',
			'import/no-unresolved': 'off',
			'import/order': [
				'warn',
				{
					'alphabetize': { order: 'asc' },
					'newlines-between': 'always',
				},
			],
			'max-statements-per-line': ['warn', { max: 1 }],
			'no-array-constructor': 'error',
			'no-async-promise-executor': 'error',
			'no-console': ['warn', { allow: ['warn', 'error'] }],
			'no-constant-binary-expression': 'error',
			'no-constant-condition': 'off',
			'no-div-regex': 'error',
			'no-duplicate-imports': 'error',
			'no-else-return': 'warn',
			'no-extend-native': 'error',
			'no-extra-bind': 'error',
			'no-implicit-coercion': 'warn',
			'no-implied-eval': 'error',
			'no-lonely-if': 'error',
			'no-loop-func': 'error',
			'no-multi-assign': 'error',
			'no-new-object': 'error',
			'no-octal-escape': 'error',
			'no-param-reassign': ['warn'],
			'no-prototype-builtins': ['off'],
			'no-return-assign': 'error',
			'no-self-compare': 'error',
			'no-sequences': 'error',
			'no-throw-literal': 'error',
			'no-unmodified-loop-condition': 'error',
			'no-unneeded-ternary': 'error',
			'no-unused-expressions': 'error',
			'no-unused-private-class-members': 'warn',
			'no-unused-vars': ['error', { ignoreRestSiblings: true }],
			'no-useless-call': 'error',
			'no-useless-computed-key': 'error',
			'no-useless-concat': 'error',
			'no-useless-constructor': 'off',
			'no-useless-rename': 'error',
			'no-useless-return': 'warn',
			'no-var': 'error',
			'no-void': ['error', { allowAsStatement: true }],
			'no-with': 'error',
			'object-shorthand': 'error',
			'one-var': ['error', 'never'],
			'prefer-arrow-callback': 'error',
			'prefer-const': ['error', { destructuring: 'all' }],
			'prefer-destructuring': 'warn',
			'prefer-exponentiation-operator': 'warn',
			'prefer-numeric-literals': 'warn',
			'prefer-object-has-own': 'warn',
			'prefer-object-spread': 'warn',
			'prefer-promise-reject-errors': 'error',
			'prefer-regex-literals': 'error',
			'prefer-rest-params': 'error',
			'prefer-spread': 'error',
			'prefer-template': 'error',
			'radix': 'error',
			'require-atomic-updates': 'warn',
			'space-before-function-paren': ['off'],
			'strict': ['error', 'never'],
			'symbol-description': 'warn',
			'unicorn/catch-error-name': 'off',
			'unicorn/consistent-assert': 'off',
			'unicorn/filename-case': 'off',
			'unicorn/no-array-callback-reference': 'off',
			'unicorn/no-await-expression-member': 'off',
			'unicorn/no-negated-condition': 'off',
			'unicorn/no-nested-ternary': 'off',
			'unicorn/no-null': 'off',
			'unicorn/no-process-exit': 'off',
			'unicorn/no-useless-undefined': 'off',
			'unicorn/numeric-separators-style': 'off',
			'unicorn/prefer-module': 'off',
			'unicorn/prefer-top-level-await': 'off',
			'unicorn/prefer-type-error': 'off',
			'unicorn/prevent-abbreviations': 'off',
			'unicorn/switch-case-braces': 'off',
			'unicorn/template-indent': 'off',
			'yoda': 'error',
		},
	},
	eslintPluginImport.flatConfigs.typescript,
	...tseslint.configs.recommended,
	{
		files: ['**/*.ts?(x)'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-extra-semi': 'off',
			'@typescript-eslint/no-useless-constructor': 'warn',
			'@typescript-eslint/explicit-module-boundary-types': [
				'warn',
				{ allowArgumentsExplicitlyTypedAsAny: true },
			],
			'@typescript-eslint/method-signature-style': 'error',
			'@typescript-eslint/no-non-null-assertion': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
		},
	},
	{
		files: ['**/*.mjs', '**/*.mts'],
		rules: esm[0].rules,
	},
	{
		files: ['**/*.tsx'],
		rules: {
			'@typescript-eslint/explicit-module-boundary-types': 'off',
		},
	},
	eslintConfigPrettier,
	{
		linterOptions: {
			reportUnusedDisableDirectives: true,
		},
		languageOptions: {
			globals: {
				...globals.builtin,
				...globals.jest,
				...globals.node,
			},
		},
	},
)

const requiresTypechecking = tseslint.config(
	...tseslint.configs.recommendedTypeCheckedOnly,
	{
		files: ['**/*.ts?(x)', '**/*.mts'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/prefer-optional-chain': 'warn',
			'@typescript-eslint/promise-function-async': 'warn',
			'@typescript-eslint/require-await': 'off',
			'@typescript-eslint/restrict-template-expressions': [
				'warn',
				{ allowNullish: false },
			],
			'@typescript-eslint/strict-boolean-expressions': [
				'warn',
				{
					allowString: false,
					allowNumber: false,
					allowNullableObject: true,
					allowNullableBoolean: false,
					allowNullableString: false,
					allowNullableNumber: false,
					allowAny: false,
					allowRuleToRunWithoutStrictNullChecksIKnowWhatIAmDoing: false,
				},
			],
		},
	},
)

export default [
	...eslintConfig,
	...esm,
	...requiresTypechecking,
	// See https://typescript-eslint.io/getting-started/typed-linting
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ['*.js', 'vite.config.ts'],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
]
