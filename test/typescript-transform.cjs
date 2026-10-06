// Build CI performs full typechecking; Jest only needs decorator-compatible JS.
const ts = require('typescript');
module.exports = {
  process(source, fileName) {
    const output = ts.transpileModule(source, {
      fileName,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021,
        experimentalDecorators: true, emitDecoratorMetadata: true,
        esModuleInterop: true,
      },
    });
    return { code: output.outputText };
  },
};
