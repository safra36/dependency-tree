// path: project-analyzer.ts

import * as fs from "fs";
import * as path from "path";
import { ShellExecutor } from "../shell-executor";
import colors from "../colors";

interface ProjectInfo {
  type: "react" | "next" | "vue" | "svelte" | "node" | "angular" | "unknown";
  framework?: string;
  packageManager: "npm" | "yarn" | "pnpm" | "bun";
  hasPackageJson: boolean;
  needsInit: boolean;
  missingPackages: string[];
  missingDevPackages: string[];
  recommendedScripts: Record<string, string>;
  initCommands: string[];
  installCommands: string[];
}

export class ProjectAnalyzer {
  private projectRoot: string;
  private shellExecutor: ShellExecutor;
  private debug: boolean;

  constructor(projectRoot: string, debug = false) {
    this.projectRoot = path.resolve(projectRoot);
    this.debug = debug;
    this.shellExecutor = new ShellExecutor(this.projectRoot, { debug });

    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] ProjectAnalyzer initialized"));
    }
  }

  async analyzeProject(): Promise<ProjectInfo> {
    if (this.debug) {
      console.log(colors.cyan("\n🔧 [DEBUG] Starting project analysis..."));
    }

    const packageJsonPath = path.join(this.projectRoot, "package.json");
    const hasPackageJson = fs.existsSync(packageJsonPath);

    let packageInfo: any = null;
    if (hasPackageJson) {
      try {
        packageInfo = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      } catch (error) {
        if (this.debug) {
          console.log(
            colors.red(
              `🔧 [DEBUG] Failed to parse package.json: ${error.message}`
            )
          );
        }
      }
    }

    const projectType = this.detectProjectType(packageInfo);
    const packageManager = this.detectPackageManager();
    const needsInit = !hasPackageJson;

    const analysis = this.getProjectRequirements(projectType, packageInfo);

    const result: ProjectInfo = {
      type: projectType,
      framework: analysis.framework,
      packageManager,
      hasPackageJson,
      needsInit,
      missingPackages: analysis.missingPackages,
      missingDevPackages: analysis.missingDevPackages,
      recommendedScripts: analysis.recommendedScripts,
      initCommands: this.generateInitCommands(projectType, packageManager),
      installCommands: this.generateInstallCommands(analysis, packageManager),
    };

    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Project analysis completed"));
      console.log(colors.gray(`  Type: ${result.type}`));
      console.log(colors.gray(`  Framework: ${result.framework || "none"}`));
      console.log(colors.gray(`  Package Manager: ${result.packageManager}`));
      console.log(colors.gray(`  Needs Init: ${result.needsInit}`));
      console.log(
        colors.gray(`  Missing packages: ${result.missingPackages.length}`)
      );
    }

    return result;
  }

  private detectProjectType(packageInfo: any): ProjectInfo["type"] {
    if (!packageInfo) {
      // Check for framework files
      if (
        this.fileExists("next.config.js") ||
        this.fileExists("next.config.ts")
      )
        return "next";
      if (this.fileExists("vue.config.js") || this.fileExists("vite.config.js"))
        return "vue";
      if (this.fileExists("svelte.config.js")) return "svelte";
      if (this.fileExists("angular.json")) return "angular";
      return "unknown";
    }

    const deps = {
      ...packageInfo.dependencies,
      ...packageInfo.devDependencies,
    };

    if (deps.next) return "next";
    if (deps.react) return "react";
    if (deps.vue) return "vue";
    if (deps.svelte) return "svelte";
    if (deps["@angular/core"]) return "angular";

    return "node";
  }

  private detectPackageManager(): ProjectInfo["packageManager"] {
    if (this.fileExists("bun.lockb")) return "bun";
    if (this.fileExists("pnpm-lock.yaml")) return "pnpm";
    if (this.fileExists("yarn.lock")) return "yarn";
    return "npm";
  }

  private getProjectRequirements(
    projectType: ProjectInfo["type"],
    packageInfo: any
  ) {
    const existing = {
      dependencies: packageInfo?.dependencies || {},
      devDependencies: packageInfo?.devDependencies || {},
    };

    const allExisting = {
      ...existing.dependencies,
      ...existing.devDependencies,
    };

    switch (projectType) {
      case "react":
        return this.getReactRequirements(allExisting);
      case "next":
        return this.getNextRequirements(allExisting);
      case "vue":
        return this.getVueRequirements(allExisting);
      case "svelte":
        return this.getSvelteRequirements(allExisting);
      case "angular":
        return this.getAngularRequirements(allExisting);
      case "node":
        return this.getNodeRequirements(allExisting);
      default:
        return {
          framework: undefined,
          missingPackages: [],
          missingDevPackages: ["typescript", "@types/node"],
          recommendedScripts: {
            build: "tsc",
            dev: "ts-node src/index.ts",
            start: "node dist/index.js",
          },
        };
    }
  }

  private getReactRequirements(existing: any) {
    const required = ["react", "react-dom"];
    const requiredDev = [
      "@types/react",
      "@types/react-dom",
      "typescript",
      "vite",
      "@vitejs/plugin-react",
    ];

    return {
      framework: "react",
      missingPackages: required.filter((pkg) => !existing[pkg]),
      missingDevPackages: requiredDev.filter((pkg) => !existing[pkg]),
      recommendedScripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
        lint: "eslint src --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
      },
    };
  }

  private getNextRequirements(existing: any) {
    const required = ["next", "react", "react-dom"];
    const requiredDev = [
      "@types/react",
      "@types/react-dom",
      "@types/node",
      "typescript",
    ];

    return {
      framework: "next",
      missingPackages: required.filter((pkg) => !existing[pkg]),
      missingDevPackages: requiredDev.filter((pkg) => !existing[pkg]),
      recommendedScripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        lint: "next lint",
      },
    };
  }

  private getVueRequirements(existing: any) {
    const required = ["vue"];
    const requiredDev = ["@vitejs/plugin-vue", "vite", "typescript"];

    return {
      framework: "vue",
      missingPackages: required.filter((pkg) => !existing[pkg]),
      missingDevPackages: requiredDev.filter((pkg) => !existing[pkg]),
      recommendedScripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
      },
    };
  }

  private getSvelteRequirements(existing: any) {
    const required = ["svelte"];
    const requiredDev = ["@sveltejs/vite-plugin-svelte", "vite", "typescript"];

    return {
      framework: "svelte",
      missingPackages: required.filter((pkg) => !existing[pkg]),
      missingDevPackages: requiredDev.filter((pkg) => !existing[pkg]),
      recommendedScripts: {
        dev: "vite dev",
        build: "vite build",
        preview: "vite preview",
      },
    };
  }

  private getAngularRequirements(existing: any) {
    const required = [
      "@angular/core",
      "@angular/common",
      "@angular/platform-browser",
    ];
    const requiredDev = ["@angular/cli", "typescript"];

    return {
      framework: "angular",
      missingPackages: required.filter((pkg) => !existing[pkg]),
      missingDevPackages: requiredDev.filter((pkg) => !existing[pkg]),
      recommendedScripts: {
        dev: "ng serve",
        build: "ng build",
        test: "ng test",
        lint: "ng lint",
      },
    };
  }

  private getNodeRequirements(existing: any) {
    const requiredDev = ["typescript", "@types/node"];

    return {
      framework: undefined,
      missingPackages: [],
      missingDevPackages: requiredDev.filter((pkg) => !existing[pkg]),
      recommendedScripts: {
        build: "tsc",
        dev: "ts-node src/index.ts",
        start: "node dist/index.js",
      },
    };
  }

  private generateInitCommands(
    projectType: ProjectInfo["type"],
    packageManager: string
  ): string[] {
    const pm = packageManager;
    const init = pm === "npm" ? "npm init -y" : `${pm} init -y`;

    const commands = [init];

    // Add specific init commands for frameworks
    if (projectType === "next") {
      commands.push("mkdir pages", "mkdir public", "mkdir styles");
    } else if (projectType === "react") {
      commands.push("mkdir src", "mkdir public");
    } else if (projectType === "vue") {
      commands.push("mkdir src", "mkdir public");
    } else if (projectType === "svelte") {
      commands.push("mkdir src", "mkdir public");
    }

    return commands;
  }

  private generateInstallCommands(
    analysis: any,
    packageManager: string
  ): string[] {
    const commands: string[] = [];
    const pm = packageManager;
    const install = pm === "npm" ? "npm install" : `${pm} add`;
    const installDev = pm === "npm" ? "npm install -D" : `${pm} add -D`;

    if (analysis.missingPackages.length > 0) {
      commands.push(`${install} ${analysis.missingPackages.join(" ")}`);
    }

    if (analysis.missingDevPackages.length > 0) {
      commands.push(`${installDev} ${analysis.missingDevPackages.join(" ")}`);
    }

    return commands;
  }

  private fileExists(fileName: string): boolean {
    return fs.existsSync(path.join(this.projectRoot, fileName));
  }

  async generateProjectSetupPlan(): Promise<{
    analysis: ProjectInfo;
    setupSteps: Array<{
      type: "command" | "file" | "info";
      description: string;
      command?: string;
      filePath?: string;
      content?: string;
    }>;
  }> {
    const analysis = await this.analyzeProject();
    const setupSteps: any[] = [];

    if (analysis.needsInit) {
      setupSteps.push({
        type: "info",
        description: "Project needs initialization",
      });

      analysis.initCommands.forEach((cmd) => {
        setupSteps.push({
          type: "command",
          description: `Initialize project: ${cmd}`,
          command: cmd,
        });
      });
    }

    if (analysis.installCommands.length > 0) {
      analysis.installCommands.forEach((cmd) => {
        setupSteps.push({
          type: "command",
          description: `Install dependencies: ${cmd}`,
          command: cmd,
        });
      });
    }

    // Add package.json scripts
    if (Object.keys(analysis.recommendedScripts).length > 0) {
      setupSteps.push({
        type: "info",
        description: "Update package.json with recommended scripts",
      });
    }

    // Add config files
    if (
      analysis.type === "react" ||
      analysis.type === "vue" ||
      analysis.type === "svelte"
    ) {
      setupSteps.push({
        type: "file",
        description: "Create Vite config",
        filePath: "vite.config.ts",
        content: this.generateViteConfig(analysis.type),
      });
    }

    if (!this.fileExists("tsconfig.json")) {
      setupSteps.push({
        type: "file",
        description: "Create TypeScript config",
        filePath: "tsconfig.json",
        content: this.generateTsConfig(analysis.type),
      });
    }

    return { analysis, setupSteps };
  }

  private generateViteConfig(projectType: string): string {
    switch (projectType) {
      case "react":
        return `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})`;
      case "vue":
        return `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
})`;
      case "svelte":
        return `import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
})`;
      default:
        return "";
    }
  }

  private generateTsConfig(projectType: string): string {
    const baseConfig = {
      compilerOptions: {
        target: "ES2020",
        useDefineForClassFields: true,
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
      },
      include: ["src"],
      references: [{ path: "./tsconfig.node.json" }],
    };

    if (projectType === "react") {
      baseConfig.compilerOptions["jsx"] = "react-jsx";
    }

    return JSON.stringify(baseConfig, null, 2);
  }
}
