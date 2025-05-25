// path: syntax-checker.ts

import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import colors from "./colors";

interface SyntaxError {
  file: string;
  line: number;
  column: number;
  message: string;
  code: number;
  severity: "error" | "warning";
  source: string;
}

export class SyntaxChecker {
  private projectRoot: string;
  private debug: boolean;

  constructor(projectRoot: string, debug = false) {
    this.projectRoot = path.resolve(projectRoot);
    this.debug = debug;
  }

  async checkFile(filePath: string): Promise<SyntaxError[]> {
    const errors: SyntaxError[] = [];

    if (!fs.existsSync(filePath)) {
      return errors;
    }

    const ext = path.extname(filePath);

    // Check TypeScript/JavaScript files
    if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
      errors.push(...this.checkTypeScript(filePath));
    }

    // Check JSON files
    if (ext === ".json") {
      errors.push(...this.checkJSON(filePath));
    }

    return errors;
  }

  async checkMultipleFiles(filePaths: string[]): Promise<SyntaxError[]> {
    const allErrors: SyntaxError[] = [];

    for (const filePath of filePaths) {
      const errors = await this.checkFile(filePath);
      allErrors.push(...errors);
    }

    return allErrors;
  }

  async checkProject(): Promise<SyntaxError[]> {
    const sourceFiles = this.findSourceFiles();
    return await this.checkMultipleFiles(sourceFiles);
  }

  private checkTypeScript(filePath: string): SyntaxError[] {
    const errors: SyntaxError[] = [];

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const relativePath = path.relative(this.projectRoot, filePath);

      // Create a temporary TypeScript program for this file
      const compilerOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        allowJs: true,
        checkJs: true,
        noEmit: true,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: false, // Less strict to avoid overwhelming errors
        noImplicitAny: false,
      };

      // Parse the file to get syntax errors
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.ES2020,
        true,
        filePath.endsWith(".jsx") || filePath.endsWith(".tsx")
          ? ts.ScriptKind.TSX
          : ts.ScriptKind.TS
      );

      // Get syntax errors from the source file
      const syntaxDiagnostics = sourceFile.parseDiagnostics || [];

      // Create a program to get semantic errors
      const program = ts.createProgram([filePath], compilerOptions);
      const semanticDiagnostics = program.getSemanticDiagnostics(sourceFile);

      // Combine all diagnostics
      const allDiagnostics = [...syntaxDiagnostics, ...semanticDiagnostics];

      for (const diagnostic of allDiagnostics) {
        if (diagnostic.file && diagnostic.start !== undefined) {
          const { line, character } =
            diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);

          errors.push({
            file: relativePath,
            line: line + 1, // Convert to 1-based
            column: character + 1,
            message: ts.flattenDiagnosticMessageText(
              diagnostic.messageText,
              "\n"
            ),
            code: diagnostic.code,
            severity:
              diagnostic.category === ts.DiagnosticCategory.Error
                ? "error"
                : "warning",
            source: "typescript",
          });
        }
      }
    } catch (error) {
      errors.push({
        file: path.relative(this.projectRoot, filePath),
        line: 1,
        column: 1,
        message: `Parse error: ${error.message}`,
        code: 0,
        severity: "error",
        source: "parser",
      });
    }

    return errors;
  }

  private checkJSON(filePath: string): SyntaxError[] {
    const errors: SyntaxError[] = [];

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      JSON.parse(content);
    } catch (error) {
      const relativePath = path.relative(this.projectRoot, filePath);

      // Parse line/column from JSON error message
      let line = 1;
      let column = 1;

      if (error.message.includes("position")) {
        const match = error.message.match(/position (\d+)/);
        if (match) {
          const position = parseInt(match[1]);
          const lines = fs
            .readFileSync(filePath, "utf-8")
            .substring(0, position)
            .split("\n");
          line = lines.length;
          column = lines[lines.length - 1].length + 1;
        }
      }

      errors.push({
        file: relativePath,
        line,
        column,
        message: `JSON syntax error: ${error.message}`,
        code: 0,
        severity: "error",
        source: "json",
      });
    }

    return errors;
  }

  printErrors(errors: SyntaxError[]): void {
    if (errors.length === 0) {
      console.log(colors.green("✅ No syntax errors found"));
      return;
    }

    console.log(colors.red(`❌ Found ${errors.length} syntax errors:`));
    console.log("");

    // Group errors by file
    const errorsByFile = new Map<string, SyntaxError[]>();
    for (const error of errors) {
      if (!errorsByFile.has(error.file)) {
        errorsByFile.set(error.file, []);
      }
      errorsByFile.get(error.file)!.push(error);
    }

    // Print errors by file
    for (const [file, fileErrors] of errorsByFile) {
      console.log(colors.yellow(`📄 ${file}:`));

      for (const error of fileErrors) {
        const icon = error.severity === "error" ? "❌" : "⚠️";
        const color = error.severity === "error" ? colors.red : colors.yellow;

        console.log(
          color(
            `  ${icon} Line ${error.line}:${error.column} - ${error.message}`
          )
        );

        // Show the problematic line with context
        this.showLineContext(path.join(this.projectRoot, file), error.line);
      }
      console.log("");
    }
  }

  private showLineContext(filePath: string, lineNumber: number): void {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      // Show 1 line before and after the error
      const start = Math.max(0, lineNumber - 2);
      const end = Math.min(lines.length, lineNumber + 1);

      for (let i = start; i < end; i++) {
        const currentLine = i + 1;
        const isErrorLine = currentLine === lineNumber;
        const prefix = isErrorLine ? ">>>" : "   ";
        const lineStr = `${currentLine}`.padStart(3);
        const color = isErrorLine ? colors.red : colors.gray;

        console.log(color(`    ${prefix} ${lineStr}: ${lines[i]}`));
      }
    } catch (error) {
      // Ignore file read errors for context
    }
  }

  private findSourceFiles(): string[] {
    const files: string[] = [];
    const extensions = [".ts", ".tsx", ".js", ".jsx", ".json"];

    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (
          stat.isDirectory() &&
          !item.startsWith(".") &&
          !["node_modules", "dist", "build", "coverage"].includes(item)
        ) {
          scanDir(fullPath);
        } else if (extensions.some((ext) => item.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    };

    scanDir(this.projectRoot);
    return files;
  }

  // Quick syntax check for a single file without full program analysis
  quickCheck(filePath: string): boolean {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const ext = path.extname(filePath);

      if (ext === ".json") {
        JSON.parse(content);
        return true;
      }

      if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
        const sourceFile = ts.createSourceFile(
          filePath,
          content,
          ts.ScriptTarget.ES2020,
          true
        );

        return (sourceFile.parseDiagnostics?.length || 0) === 0;
      }

      return true;
    } catch {
      return false;
    }
  }

  // Get syntax errors summary
  getErrorSummary(errors: SyntaxError[]): {
    totalErrors: number;
    errorCount: number;
    warningCount: number;
    fileCount: number;
    mostCommonErrors: Array<{ message: string; count: number }>;
  } {
    const errorCount = errors.filter((e) => e.severity === "error").length;
    const warningCount = errors.filter((e) => e.severity === "warning").length;
    const fileCount = new Set(errors.map((e) => e.file)).size;

    // Count common error messages
    const errorMessages = new Map<string, number>();
    for (const error of errors) {
      const baseMessage = error.message.split(".")[0]; // Get first sentence
      errorMessages.set(baseMessage, (errorMessages.get(baseMessage) || 0) + 1);
    }

    const mostCommonErrors = Array.from(errorMessages.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([message, count]) => ({ message, count }));

    return {
      totalErrors: errors.length,
      errorCount,
      warningCount,
      fileCount,
      mostCommonErrors,
    };
  }
}
