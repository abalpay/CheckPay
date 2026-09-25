import security from 'eslint-plugin-security'
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

const config = [
  { ignores: ['backend/**'] },
  ...nextCoreWebVitals,
  security.configs.recommended,
  {
    rules: {
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-unsafe-regex': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-possible-timing-attacks': 'warn',
    },
  },
]

export default config
