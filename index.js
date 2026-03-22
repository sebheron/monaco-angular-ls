import ls from "@angular/language-service/bundles/language-service.js";
import { initialize } from "monaco-editor/esm/vs/common/initialize.js";
import { typescript } from "monaco-editor/esm/vs/language/typescript/lib/typescriptServices.js";
import { TypeScriptWorker } from "monaco-editor/esm/vs/language/typescript/ts.worker.js";
import path from "path-browserify-esm";

const wrappedPath = new Proxy(path, {
  get: (target, prop) => {
    const original = target[prop];
    if (typeof original !== "function") return original;

    if (prop === "isAbsolute") {
      return (p) => {
        const result = p.startsWith("file:///") || original(p);
        console.log('path.isAbsolute called:', p, '->', result);
        return result;
      };
    }
    if (prop === "resolve") {
      return (...args) => {
        const cleaned = args.map((a) => typeof a === 'string' ? a.replace(/^file:\/\//, "") : a);
        // Ensure resolve has an absolute base
        if (cleaned.length === 0 || !cleaned[0].startsWith("/")) {
          cleaned.unshift("/");
        }
        const result = original(...cleaned);
        return "file://" + result;
      };
    }
    if (prop === "join") {
      return (...args) => {
        const hasFilePrefix = args.some((a) => a.startsWith("file://"));
        const result = original(
          ...args.map((a) => a.replace(/^file:\/\//, ""))
        );
        const final = hasFilePrefix ? "file://" + result : result;
        console.log('path.join called:', args, '->', final);
        return final;
      };
    }
    if (prop === "relative") {
      return (from, to) => {
        const result = original(from.replace(/^file:\/\//, ""), to.replace(/^file:\/\//, ""));
        console.log('path.relative called:', from, to, '->', result);
        return result;
      };
    }
    if (prop === "dirname") {
      return (p) => {
        if (p.startsWith("file://")) {
          return "file://" + original(p.replace(/^file:\/\//, ""));
        }
        return original(p);
      };
    }
    if (prop === "basename") {
      return (p, ext) => original(p.replace(/^file:\/\//, ""), ext);
    }
    if (prop === "extname") {
      return (p) => original(p.replace(/^file:\/\//, ""));
    }
    if (prop === "normalize") {
      return (p) => {
        if (p.startsWith("file://")) {
          return "file://" + original(p.replace(/^file:\/\//, ""));
        }
        return original(p);
      };
    }
    return original.bind ? original.bind(target) : original;
  },
});

class AngularWorker extends TypeScriptWorker {
  constructor() {
    super(...arguments);
    this.angularLanguageService = null;
    this._virtualScriptInfos = new Map();
  }

  getScriptFileNames() {
    const real = super.getScriptFileNames();
    const virtual = [...this._virtualScriptInfos.keys()].filter(
      (k) => !real.includes(k)
    );
    return [...real, ...virtual];
  }

  _getScriptText(fileName) {
    const real = super._getScriptText(fileName);
    if (real !== undefined) return real;
    const info = this._virtualScriptInfos.get(fileName);
    if (info) {
      const snap = info.getSnapshot();
      return snap.getText(0, snap.getLength());
    }
    return undefined;
  }

  getScriptSnapshot(fileName) {
    const real = super.getScriptSnapshot(fileName);
    if (real) return real;
    const info = this._virtualScriptInfos.get(fileName);
    if (info) return info.getSnapshot();
    return undefined;
  }

  getScriptVersion(fileName) {
    const real = super.getScriptVersion(fileName);
    if (real) return real;
    const info = this._virtualScriptInfos.get(fileName);
    if (info) return info.getLatestVersion();
    return "";
  }

  getScriptKind(fileName) {
    if (this._virtualScriptInfos.has(fileName)) {
      return this._virtualScriptInfos.get(fileName).scriptKind;
    }
    return super.getScriptKind(fileName);
  }
  getAngularLanguageService() {
    if (!this.angularLanguageService) {
      const worker = this;
      const assert = (condition, msg) => {
        if (!condition)
          throw new Error(msg !== null && msg !== void 0 ? msg : "failed");
      };
      assert.ok = (v) => {
        if (!v) throw new Error("failed");
      };
      assert.fail = (msg) => {
        throw new Error(msg !== null && msg !== void 0 ? msg : "failed");
      };
      document = {
        baseURI: "file:///",
      };
      require = (moduleName) => {
        const normalised = moduleName.replace(/^node:/, "");
        const overrides = {
          typescript,
          fs: {
            readFileSync: (filePath) => {
              var _a;
              return (_a = worker._getScriptText(filePath)) !== null &&
                _a !== void 0
                ? _a
                : "";
            },
            existsSync: (filePath) =>
              worker._getScriptText(filePath) !== undefined,
            statSync: () => ({
              isFile: () => true,
              isDirectory: () => false,
              isSymbolicLink: () => false,
            }),
            lstatSync: () => ({
              isFile: () => true,
              isDirectory: () => false,
              isSymbolicLink: () => false,
            }),
            readdirSync: () => [],
            realpathSync: (filePath) => filePath,
            writeFileSync: () => {},
            mkdirSync: () => {},
            rmdirSync: () => {},
            renameSync: () => {},
            copyFileSync: () => {},
            symlinkSync: () => {},
            unlinkSync: () => {},
          },
          os: {},
          path: wrappedPath,
          "node:path": wrappedPath,
          url: {
            fileURLToPath: (u) => u.replace(/^file:\/\//, ""),
            pathToFileURL: (p) => ({
              href: p.startsWith("file://") ? p : "file://" + p,
            }),
            URL: globalThis.URL,
          },
          module: { createRequire: () => require },
          assert,
        };
        if (!(normalised in overrides))
          throw new Error(
            `Something went wrong getting the angular language service modules. Make a note of the following module name and report it as missing: ${moduleName}`
          );
        return overrides[normalised];
      };
      process = {
        ...globalThis.process,
        platform: "linux",
        env: {},
        argv: [],
        versions: { node: "20.0.0" },
        cwd: () => "/",
        memoryUsage: () => {
          const mem = performance?.memory;
          return {
            rss: mem?.totalJSHeapSize || 0,
            heapTotal: mem?.totalJSHeapSize || 0,
            heapUsed: mem?.usedJSHeapSize || 0,
            external: 0,
            arrayBuffers: 0,
          };
        },
        hrtime: (prev) => {
          const now = performance.now();
          const sec = Math.floor(now / 1000);
          const nano = Math.floor((now % 1000) * 1e6);
          if (prev) return [sec - prev[0], nano - prev[1]];
          return [sec, nano];
        },
        nextTick: (cb) => setTimeout(cb, 0),
        stdout: { write: () => {} },
        stderr: { write: () => {} },
        exit: () => {},
        on: () => {},
        off: () => {},
        emit: () => {},
      };
      const plugin = ls({ typescript });
      require = () => {
        throw new Error(
          "The require function should not be used outside of the angular language service plugin factory."
        );
      };

      const logger = {
        info: () => {},
        msg: () => {},
        loggingEnabled: () => false,
        hasLevel: () => false,
        getLogFileName: () => undefined,
        close: () => {},
      };

      const fileNames = this.getScriptFileNames();

      const scriptInfoHost = {
        useCaseSensitiveFileNames: false,
        readFile: (fileName) => worker._getScriptText(fileName),
        fileExists: (fileName) => worker._getScriptText(fileName) !== undefined,
        writeFile: () => {},
        newLine: "\n",
        realpath: (p) => p,
      };

      const scriptInfoMap = this._virtualScriptInfos;

      const getScriptInfo = (fileName) => {
        if (scriptInfoMap.has(fileName)) return scriptInfoMap.get(fileName);

        if (worker._getScriptText(fileName) === undefined) return undefined;

        const ext = fileName.substring(fileName.lastIndexOf("."));
        let scriptKind = typescript.ScriptKind.TS;
        if (ext === ".tsx" || ext === ".jsx")
          scriptKind = typescript.ScriptKind.TSX;
        else if (ext === ".js") scriptKind = typescript.ScriptKind.JS;

        const info = new typescript.server.ScriptInfo(
          scriptInfoHost,
          fileName,
          scriptKind,
          false, // hasMixedContent
          fileName // path
        );
        info.open(worker._getScriptText(fileName));
        scriptInfoMap.set(fileName, info);
        return info;
      };

      const createScriptInfo = (fileName, content, scriptKind) => {
        const info = new typescript.server.ScriptInfo(
          scriptInfoHost,
          fileName,
          scriptKind ?? typescript.ScriptKind.External,
          false,
          fileName
        );
        info.open(content ?? "");
        scriptInfoMap.set(fileName, info);
        return info;
      };

      const rootFileNames = new Set(fileNames);

      const project = {
        projectKind: typescript.server.ProjectKind.Inferred,
        getLanguageService: () => this._languageService,
        getCompilationSettings: () => worker.getCompilationSettings(),
        getCompilerOptions: () => worker.getCompilationSettings(),
        getScriptFileNames: () => [...rootFileNames],
        getCurrentDirectory: () => "file:///",
        readFile: (filePath) => worker._getScriptText(filePath),
        fileExists: (filePath) => worker._getScriptText(filePath) !== undefined,
        getScriptVersion: (fileName) => worker.getScriptVersion(fileName),
        readDirectory: () => [],
        getProjectName: () => "file:///inferred",
        getProjectReferences: () => null,
        getScriptInfo,
        containsScriptInfo: (scriptInfo) =>
          rootFileNames.has(scriptInfo.fileName),
        addRoot: (scriptInfo) => {
          rootFileNames.add(scriptInfo.fileName);
          scriptInfo.attachToProject(project);
        },
        onFileAddedOrRemoved: () => {},
        markFileAsDirty: () => {},
        markAsDirty: () => {},
        toPath: (fileName) => fileName,
        projectService: {
          logger: logger,
          toCanonicalFileName: (fileName) => fileName,
          getScriptInfo,
          getOrCreateScriptInfoForNormalizedPath: (
            fileName,
            openedByClient,
            fileContent,
            scriptKind
          ) => {
            const existing = getScriptInfo(fileName);
            if (existing) return existing;
            return createScriptInfo(fileName, fileContent, scriptKind);
          },
        },
      };

      this.angularLanguageService = plugin.create({
        project: project,
        languageService: this._languageService,
        languageServiceHost: this,
        config: {
          angularOnly: false,
          forceStrictTemplates: true,
        },
        serverHost: {
          readFile: (filePath) => worker._getScriptText(filePath),
        },
      });
    }
    return this.angularLanguageService;
  }
  
  async getSemanticDiagnostics(fileName) {
    try {
      const diagnostics = this.getAngularLanguageService().getSemanticDiagnostics(fileName);
      const clearedDiagnostics = TypeScriptWorker.clearFiles(diagnostics).map(d => {
        // Strip source file, it can't be serialized
        d.sourceFile = undefined;
        return d;
      });
      console.log('getSemanticDiagnostics for', fileName, '->', clearedDiagnostics);
      return clearedDiagnostics;
    }
    catch {
      const diagnostics = this._languageService.getSemanticDiagnostics(fileName);
      const clearedDiagnostics = TypeScriptWorker.clearFiles(diagnostics);
      return clearedDiagnostics;
    }
  }

  async getCompletionsAtPosition(fileName, position) {
    var _a;
    return (_a = this.getAngularLanguageService().getCompletionsAtPosition(
      fileName,
      position,
      undefined
    )) !== null && _a !== void 0
      ? _a
      : this._languageService.getCompletionsAtPosition(
          fileName,
          position,
          undefined
        );
  }
  async getQuickInfoAtPosition(fileName, position) {
    var _a;
    return (_a = this.getAngularLanguageService().getQuickInfoAtPosition(
      fileName,
      position
    )) !== null && _a !== void 0
      ? _a
      : this._languageService.getQuickInfoAtPosition(fileName, position);
  }
}

self.onmessage = () => {
  initialize((ctx, createData) => {
    return new AngularWorker(ctx, createData);
  });
};