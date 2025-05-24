#!/usr/bin/env node
// path: cli.ts

import { AICodeAgent } from './ai-coding-agent';
import { AIPromptSystem } from './ai-prompt-system';
import { LineTrackingEditor } from './line-tracker-editor';
import * as path from 'path';
import * as fs from 'fs';

interface CLIOptions {
  command: string;
  args: string[];
  projectRoot: string;
  debug: boolean;
  maxDepth: number;
  help: boolean;
}

class CLIRunner {
  private options: CLIOptions;

  constructor() {
    this.options = this.parseArgs();
  }

  private parseArgs(): CLIOptions {
    const args = process.argv.slice(2);
    
    const options: CLIOptions = {
      command: args[0] || 'help',
      args: [],
      projectRoot: process.cwd(),
      debug: false,
      maxDepth: 3,
      help: false
    };

    for (let i = 1; i < args.length; i++) {
      switch (args[i]) {
        case '--root':
          options.projectRoot = path.resolve(args[++i] || process.cwd());
          break;
        case '--debug':
          options.debug = true;
          break;
        case '--depth':
          options.maxDepth = parseInt(args[++i]) || 3;
          break;
        case '--help':
        case '-h':
          options.help = true;
          break;
        default:
          options.args.push(args[i]);
          break;
      }
    }

    return options;
  }

  async run(): Promise<void> {
    if (this.options.help) {
      this.showHelp();
      return;
    }

    try {
      switch (this.options.command) {
        case 'init':
          await this.initializeAgent();
          break;
        case 'request':
          await this.handleUserRequest();
          break;
        case 'compile':
          await this.compileProject();
          break;
        case 'context':
          await this.generateContext();
          break;
        case 'edit':
          await this.editFile();
          break;
        case 'demo':
          await this.runDemo();
          break;
        default:
          console.log(`❌ Unknown command: ${this.options.command}`);
          this.showHelp();
          break;
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      if (this.options.debug) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  private async initializeAgent(): Promise<void> {
    console.log('🤖 Initializing AI Code Agent...');
    
    const agent = new AICodeAgent(this.options.projectRoot, {
      debug: this.options.debug,
      maxDepth: this.options.maxDepth
    });

    await agent.initialize();
    console.log('✅ AI Code Agent initialized successfully!');
  }

  private async handleUserRequest(): Promise<void> {
    const request = this.options.args.join(' ');
    
    if (!request) {
      console.log('❌ Please provide a request');
      console.log('Example: npm run agent:request "Add email validation to UserService"');
      return;
    }

    console.log(`📝 Processing request: ${request}`);
    
    const agent = new AICodeAgent(this.options.projectRoot, {
      debug: this.options.debug,
      maxDepth: this.options.maxDepth
    });

    await agent.initialize();
    const result = await agent.handleUserRequest(request);

    if (result.success) {
      console.log('✅ Request completed successfully!');
      console.log('Changes made:');
      result.changes.forEach(change => console.log(`  - ${change}`));
    } else {
      console.log('❌ Request failed:');
      result.errors?.forEach(error => console.log(`  - ${error}`));
    }
  }

  private async compileProject(): Promise<void> {
    console.log('🔨 Compiling TypeScript project...');
    
    const promptSystem = new AIPromptSystem(this.options.projectRoot, this.options.debug);
    const result = promptSystem.compileTypeScript();

    if (result.success) {
      console.log('✅ TypeScript compilation successful!');
    } else {
      console.log('❌ TypeScript compilation errors:');
      result.errors.forEach(error => 
        console.log(`  - ${error.file}:${error.line} - ${error.message}`)
      );
    }
  }

  private async generateContext(): Promise<void> {
    const targetFile = this.options.args[0];
    
    if (!targetFile) {
      console.log('❌ Please provide a target file');
      console.log('Example: npm run context src/app.ts');
      return;
    }

    console.log(`📚 Generating context for: ${targetFile}`);
    
    const promptSystem = new AIPromptSystem(this.options.projectRoot, this.options.debug);
    const context = promptSystem.getDirectFileContent([targetFile]);
    
    console.log(context);
  }

  private async editFile(): Promise<void> {
    const filePath = this.options.args[0];
    
    if (!filePath) {
      console.log('❌ Please provide a file path');
      console.log('Example: npm run edit src/service.ts');
      return;
    }

    console.log(`✏️ Opening file for editing: ${filePath}`);
    
    const editor = new LineTrackingEditor(this.options.debug);
    const indexedContent = editor.loadFile(filePath);
    
    console.log('File content with line numbers:');
    indexedContent.forEach(line => console.log(line));
  }

  private async runDemo(): Promise<void> {
    console.log('🎯 Running AI Coding Agent Demo...');
    
    // Create a simple demo file
    const demoFile = path.join(this.options.projectRoot, 'demo-file.ts');
    const demoContent = `// Demo TypeScript file
export class DemoService {
  constructor() {
    console.log('Demo service created');
  }
  
  getMessage(): string {
    return 'Hello from demo!';
  }
}`;

    fs.writeFileSync(demoFile, demoContent);
    
    try {
      const agent = new AICodeAgent(this.options.projectRoot, {
        debug: this.options.debug,
        maxDepth: 2
      });

      await agent.initialize();
      
      console.log('✅ Demo completed! Check the demo-file.ts');
      
    } finally {
      // Cleanup
      if (fs.existsSync(demoFile)) {
        fs.unlinkSync(demoFile);
      }
    }
  }

  private showHelp(): void {
    console.log(`
🤖 AI Coding Agent CLI

Usage: npm run <script> [options]

Commands:
  agent:init                    Initialize the AI agent
  agent:request "<request>"     Process a coding request  
  agent:compile                 Compile TypeScript and check for errors
  context <file>                Generate context for a file
  edit <file>                   Open file for line-based editing
  demo                          Run a demonstration

Build Scripts:
  build                         Compile TypeScript to dist/
  build:watch                   Compile with watch mode
  clean                         Remove dist/ directory
  dev                           Development mode with watch

Dependency Analysis:
  deps <file>                   Analyze file dependencies (tree view)
  deps:content <file>           Get complete file context
  deps:json <file>              Export dependencies as JSON
  deps:debug <file>             Debug dependency resolution

Context Generation:
  context <file>                Generate AI context for file
  context:ai <file>             Export context to ai-context.md
  analyze <file>                Analyze file with content

Options:
  --root <path>                 Set project root directory
  --debug                       Enable debug output
  --depth <n>                   Set maximum dependency depth
  --help, -h                    Show this help

Examples:
  npm run agent:request "Add email validation method"
  npm run context src/service.ts
  npm run deps:content src/app.ts
  npm run agent:compile

For more information, see README.md
    `);
  }
}

// Run CLI if called directly
if (require.main === module) {
  const cli = new CLIRunner();
  cli.run().catch(console.error);
}

export { CLIRunner };