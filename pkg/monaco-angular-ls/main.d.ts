export interface PluginConfig {
    /**
     * If true, return only Angular results. Otherwise, return Angular + TypeScript results.
     */
    angularOnly?: boolean;
    /**
     * If false, disable `strictTemplates` in the language service.
     */
    strictTemplates?: boolean;
    /**
     * If false, disables parsing control flow blocks in the compiler. Should be used only when older
     * versions of Angular that do not support blocks (pre-v17) used with the language service.
     */
    enableBlockSyntax?: boolean;
    /**
     * Version of `@angular/core` that should be used by the language service.
     */
    angularCoreVersion?: string;
    /**
     * If false, disables parsing of `@let` declarations in the language service.
     */
    enableLetSyntax?: boolean;
    /**
     * A list of diagnostic codes that should be supressed in the language service.
     */
    suppressAngularDiagnosticCodes?: number[];
}

/**
 * Patches the typescript and html service to support Angular language features.
 * @returns A function that reverts all changes made to monaco by the plugin.
 */
declare function setupAngularWorker(config?: PluginConfig): () => void;
export default setupAngularWorker;