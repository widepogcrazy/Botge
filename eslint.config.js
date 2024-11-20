import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {files: ["**/*.{mjs,cjs,ts}"]},
  {languageOptions: { globals: globals.browser }},
  pluginJs.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/class-methods-use-this": "error",
      "@typescript-eslint/consistent-return": "error",
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/default-param-last": "error",
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/explicit-member-accessibility": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/init-declarations": "error",
      //"@typescript-eslint/max-params": "error",
      "@typescript-eslint/member-ordering": "error",
      "@typescript-eslint/method-signature-style": "error",
      //"@typescript-eslint/naming-convention": "error",
      "@typescript-eslint/no-dupe-class-members" : "error",
      "@typescript-eslint/no-empty-interface" : "error",
      "@typescript-eslint/no-import-type-side-effects" : "error",

      "@typescript-eslint/no-invalid-this" : "error",
      "@typescript-eslint/no-loop-func" : "error",
      "@typescript-eslint/no-loss-of-precision" : "error",
      //"@typescript-eslint/no-magic-numbers" : "error",
      "@typescript-eslint/no-redeclare" : "error",

      "@typescript-eslint/no-restricted-imports" : "error",
      "@typescript-eslint/no-restricted-types" : "error",
      "@typescript-eslint/no-shadow" : "error",
      //"@typescript-eslint/no-type-alias" : "error",
      "@typescript-eslint/no-unnecessary-parameter-property-assignment" : "error",

      "@typescript-eslint/no-unnecessary-qualifier" : "error",
      //"@typescript-eslint/no-unsafe-type-assertion" : "error",
      "@typescript-eslint/no-use-before-define" : "error",
      "@typescript-eslint/no-useless-empty-export" : "error",
      "@typescript-eslint/no-var-requires" : "error",

      "@typescript-eslint/parameter-properties" : "error",
      "@typescript-eslint/prefer-destructuring" : "error",
      "@typescript-eslint/prefer-enum-initializers" : "error",
      "@typescript-eslint/prefer-readonly" : "error",
      "@typescript-eslint/prefer-readonly-parameter-types" : [
        "error",
        { allow: [
          { from: "package", name: "RequestInit", package: "node-fetch" },
          { from: "package", name: [ "Interaction", "CommandInteraction", "Client" ], package: "discord.js" }
        ] }
      ],

      "@typescript-eslint/prefer-ts-expect-error" : "error",
      "@typescript-eslint/promise-function-async" : "error",
      "@typescript-eslint/require-array-sort-compare" : "error",
      "@typescript-eslint/sort-type-constituents" : "error",
      "@typescript-eslint/strict-boolean-expressions" : "error",
      "@typescript-eslint/switch-exhaustiveness-check" : "error",
      "@typescript-eslint/typedef" : "error",

      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true } ],
      "@typescript-eslint/no-misused-promises": [ "error", { checksVoidReturn: false } ],

      "@typescript-eslint/consistent-type-definitions" : [ "error", 'type' ],

      "eqeqeq": "error",
      "strict": "error",
      "array-callback-return": "error",
      "no-await-in-loop": "error",
      "no-constructor-return": "error",

      "no-duplicate-imports": "error",
      "no-inner-declarations": "error",
      "no-promise-executor-return": "error",
      "no-self-compare": "error",
      "no-template-curly-in-string": "error",
      "no-unmodified-loop-condition": "error",
      "no-unreachable-loop": "error",

      "no-use-before-define": "error",
      "no-useless-assignment": "error",
      "require-atomic-updates": "error",

      "no-unused-expressions": "error",
      "no-invalid-this": "error"
    }
  }
];