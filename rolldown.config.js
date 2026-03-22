import { defineConfig } from "rolldown";

export default defineConfig({
  input: "index.js",
  plugins: [
    {
      name: "remove-require-polyfill",
      renderChunk(code) {
        return code.replace(
          /\/\/#region.*?rolldown\/runtime\.js[\s\S]*?__require[\s\S]*?\}\);/m,
          ""
        ).replace('__require', "require")
      },
    },
    {
      name: "language-service-transform",
      transform(code, id) {
        if (!id.includes("language-service")) return;
        return (
          code.replace("module.exports = function", "export default function") +
          "\n"
        );
      },
    },
  ],
  external: (id) => id === "monaco-editor" || id.startsWith("monaco-editor/"),
  output: {
    format: "esm",
    file: "build.js",
    intro: "var require;var document;var process;",
    polyfillRequire: false,
  },
});
