# 🌳 Complete Dependency Tree Extractor

A powerful, comprehensive tool for analyzing file dependencies and extracting complete context for code editing, debugging, and documentation. Perfect for understanding complex codebases, providing context to AI assistants, and code review workflows.

## ✨ Features

- 🔍 **Smart Import Detection** - Comprehensive parsing of ES6, CommonJS, TypeScript, and Svelte imports
- 🎯 **Intelligent Path Resolution** - Handles absolute imports, relative paths, and framework-specific aliases
- 📊 **Multiple Output Formats** - Tree view, complete file contents, JSON export, and flat lists
- 🟠 **Svelte/SvelteKit Support** - Full support for Svelte files and SvelteKit aliases (`$lib`, `$app`, etc.)
- 🔄 **Circular Dependency Detection** - Identifies and reports circular import chains
- 🛡️ **Robust Error Handling** - Graceful handling of missing files, binary content, and large files
- 🚀 **Auto Project Detection** - Automatically detects project structure and root directory
- 📝 **Rich Debugging** - Detailed debug output for troubleshooting import resolution

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/safra36/dependency-tree


# Navigate through cloned repo
cd dependency-tree

# Make it executable
chmod +x dependency-tree.js

# Or use with Node.js directly
node dependency-tree.js
```

### Basic Usage

```bash
# Analyze a file's dependencies
node dependency-tree.js src/app.module.ts

# Get complete file contents for editing context
node dependency-tree.js src/service.ts --format content

# Debug import resolution issues
node dependency-tree.js src/problematic-file.ts --debug
```

## 📖 Usage Guide

### Command Line Syntax

```bash
node dependency-tree.js <file> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--depth <n>` | Maximum depth to traverse | Infinite |
| `--format <type>` | Output format: `tree`, `json`, `list`, `content` | `tree` |
| `--root <path>` | Project root directory | Auto-detected |
| `--include-external` | Include external/node_modules dependencies | `false` |
| `--show-size` | Show file sizes in tree view | `false` |
| `--show-external` | Show external dependencies in output | `true` |
| `--max-content <n>` | Maximum content length per file | `100000` |
| `--exclude <pattern>` | Exclude files matching regex pattern | - |
| `--debug` | Enable detailed debug output | `false` |
| `--help`, `-h` | Show help message | - |

## 📊 Output Formats

### 1. Tree Format (Default)

Visual hierarchy showing dependency relationships:

```bash
node dependency-tree.js src/app.module.ts
```

```
🔍 Analyzing dependencies for: src/app.module.ts

└── src/app.module.ts (2.1 KB)
    ├── src/app.controller.ts (1.8 KB)
    │   ├── src/services/user.service.ts (3.2 KB)
    │   └── src/dtos/user.dto.ts (1.1 KB)
    ├── src/app.service.ts (2.3 KB)
    └── src/database/database.module.ts (1.5 KB) 🔄

📊 Statistics:
  Total files: 5
  Total size: 10.9 KB
  Circular deps: 1
```

### 2. Content Format

Complete file contents with syntax highlighting - **perfect for AI assistants and code editing**:

```bash
node dependency-tree.js src/service.ts --format content
```

```
📁 Complete Dependency Context (3 files)

src/service.ts:
```typescript
import { Injectable } from '@nestjs/common';
import { UserRepository } from './repositories/user.repository';

@Injectable()
export class UserService {
    constructor(private userRepo: UserRepository) {}
    
    async findAll() {
        return this.userRepo.findAll();
    }
}
```

================================================================================

src/repositories/user.repository.ts:
```typescript
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

export class UserRepository extends Repository<User> {
    // ... complete file content
}
```

📊 Statistics:
  Total files: 3
  Total size: 15.2 KB
```

### 3. List Format

Flat list of all dependencies:

```bash
node dependency-tree.js src/app.ts --format list
```

```
📋 All Dependencies (8 files):

  1. src/app.ts
  2. src/services/auth.service.ts
  3. src/services/user.service.ts
  4. src/models/user.model.ts
  5. src/utils/validation.ts
  6. src/config/database.config.ts
  7. src/middleware/auth.middleware.ts
  8. src/types/index.ts
```

### 4. JSON Format

Machine-readable output for tools and scripts:

```bash
node dependency-tree.js src/app.ts --format json > dependencies.json
```

## 🎯 Framework Support

### TypeScript/JavaScript Projects

```bash
# NestJS application
node dependency-tree.js src/app.module.ts --format content

# React components
node dependency-tree.js src/components/UserProfile.tsx --format content

# Express server
node dependency-tree.js src/server.js --format content --depth 3
```

### Svelte/SvelteKit Projects

Full support for Svelte files and SvelteKit conventions:

```bash
# SvelteKit layout file
node dependency-tree.js src/routes/+layout.svelte --format content

# Svelte component with $lib imports
node dependency-tree.js src/lib/components/Button.svelte --format content

# Debug SvelteKit alias resolution
node dependency-tree.js src/routes/+page.svelte --debug
```

**Supported SvelteKit Aliases:**
- `$lib/*` → `src/lib/*`
- `$app/*` → SvelteKit built-ins
- `$env/*` → Environment variables
- `$service-worker` → Service worker

### Angular Projects

```bash
# Angular component
node dependency-tree.js src/app/user/user.component.ts --format content

# Angular service
node dependency-tree.js src/app/services/api.service.ts --format content
```

## 💡 Common Use Cases

### 1. Understanding Code Before Editing

Get complete context for any file:

```bash
node dependency-tree.js src/complex-service.ts --format content --depth 3
```

Perfect for understanding what you need to know before making changes.

### 2. Providing Context to AI Assistants

Export complete context for AI code review or assistance:

```bash
node dependency-tree.js src/feature.ts --format content > context.md
```

### 3. Code Review Preparation

Understand the full scope of changes:

```bash
node dependency-tree.js src/modified-file.ts --format content --show-size
```

### 4. Debugging Import Issues

Find out why imports aren't resolving:

```bash
node dependency-tree.js src/problematic-file.ts --debug --root ./project-root
```

### 5. Documentation Generation

Create dependency maps for documentation:

```bash
node dependency-tree.js src/app.ts --format json > docs/dependencies.json
node dependency-tree.js src/app.ts --format list > docs/file-list.txt
```

### 6. Refactoring Analysis

Identify circular dependencies and file relationships:

```bash
node dependency-tree.js src/app.module.ts --show-size
```

## 🔧 Advanced Configuration

### Custom Root Directory

For complex project structures:

```bash
node dependency-tree.js ./packages/api/src/main.ts --root ./packages/api
```

### Excluding Files

Skip test files and build outputs:

```bash
node dependency-tree.js src/app.ts --exclude "\.test\." --exclude "\.spec\." --exclude "dist/"
```

### Large File Handling

Increase content limits for large files:

```bash
node dependency-tree.js src/large-file.ts --format content --max-content 200000
```

### Including External Dependencies

Analyze npm package dependencies:

```bash
node dependency-tree.js src/app.ts --format content --include-external
```

## 🛠️ Integration

### Package.json Scripts

Add convenient npm scripts:

```json
{
  "scripts": {
    "deps": "node dependency-tree.js",
    "deps:content": "node dependency-tree.js --format content",
    "deps:debug": "node dependency-tree.js --debug",
    "context": "node dependency-tree.js --format content --depth 3"
  }
}
```

### VS Code Tasks

Add to `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Get File Context",
      "type": "shell",
      "command": "node",
      "args": ["dependency-tree.js", "${file}", "--format", "content"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "panel": "new"
      }
    }
  ]
}
```

### Git Hooks

Pre-commit hook to check for circular dependencies:

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Checking for circular dependencies..."
node dependency-tree.js src/app.module.ts --format json | grep -q '"circular": true'

if [ $? -eq 0 ]; then
  echo "❌ Circular dependencies detected!"
  node dependency-tree.js src/app.module.ts | grep "🔄"
  exit 1
fi

echo "✅ No circular dependencies found"
```

## 🐛 Troubleshooting

### Common Issues

#### Files Not Found
```bash
# Check if the root directory is correct
node dependency-tree.js src/file.ts --debug --root ./correct-project-root
```

#### Imports Not Resolving
```bash
# Use debug mode to see resolution attempts
node dependency-tree.js src/file.ts --debug
```

#### Large Files Skipped
```bash
# Increase content limit
node dependency-tree.js src/large-file.ts --max-content 200000
```

#### Missing Dependencies
```bash
# Check if files exist and aren't excluded
node dependency-tree.js src/file.ts --debug
```

### Debug Output Explanation

When using `--debug`, you'll see:

- 📁 **Root directory detection**
- 📄 **File processing steps**
- 🔍 **Import resolution attempts**
- ✅/❌ **Success/failure indicators**
- ⚠️ **Warnings and skipped files**

## 📚 Examples

### NestJS Project

```bash
# Analyze main application module
node dependency-tree.js src/app.module.ts --format content

# Check service dependencies
node dependency-tree.js src/users/users.service.ts --format content --depth 2

# Debug controller imports
node dependency-tree.js src/users/users.controller.ts --debug
```

### SvelteKit Project

```bash
# Analyze main layout
node dependency-tree.js src/routes/+layout.svelte --format content

# Check component dependencies
node dependency-tree.js src/lib/components/Header.svelte --format content

# Debug $lib alias resolution
node dependency-tree.js src/routes/+page.svelte --debug
```

### React Project

```bash
# Analyze main App component
node dependency-tree.js src/App.tsx --format content

# Check custom hook dependencies
node dependency-tree.js src/hooks/useAuth.ts --format content

# Generate component tree
node dependency-tree.js src/components/UserDashboard.tsx --depth 3
```

## 🔄 Output Examples

### Tree with Circular Dependencies

```
└── src/app.module.ts
    ├── src/users/users.module.ts
    │   ├── src/users/users.service.ts
    │   │   └── src/shared/database.service.ts
    │   └── src/users/users.controller.ts
    └── src/shared/shared.module.ts
        └── src/shared/database.service.ts 🔄

🔄 Circular Dependencies:
  src/users/users.service.ts -> src/shared/database.service.ts
```

### Content with Size Information

```bash
node dependency-tree.js src/service.ts --format content --show-size
```

```
📁 Complete Dependency Context (3 files)

src/service.ts: (4.2 KB)
```typescript
// Large service file content...
// ... (truncated at 100000 characters)
// Original size: 4.2 KB
```

## 🤝 Contributing

### Reporting Issues

When reporting issues, please include:

1. **Command used**: `node dependency-tree.js ...`
2. **Debug output**: Add `--debug` flag
3. **Project structure**: Brief description
4. **Expected vs actual behavior**

### Feature Requests

We welcome feature requests for:
- New framework support
- Additional output formats
- Integration improvements
- Performance enhancements

## 📄 License

MIT License - feel free to use in your projects!

## 🙏 Acknowledgments

- Inspired by the need for better code context tools
- Built for developers who work with complex codebases
- Designed to work seamlessly with AI-assisted development

---