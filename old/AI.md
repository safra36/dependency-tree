# 🤖 Interactive AI Coding Agent

An intelligent, interactive coding assistant that helps you write, modify, and debug code through natural language conversations.

## 🚀 Getting Started

### Prerequisites
- Node.js 16.0.0 or higher
- TypeScript project (recommended)

### Installation & Setup

1. **Clone and build the project:**
   ```bash
   git clone <repository-url>
   cd ai-coding-agent
   npm install
   npm run build
   ```

2. **Start the interactive session:**
   ```bash
   npm start
   # or
   npm run interactive
   ```

## 💬 Interactive Mode

When you start the interactive mode, you'll see:

```
🤖 AI Coding Agent - Interactive Mode
===============================================

Welcome to the AI Coding Agent!
Type your coding requests and I'll help you implement them.

Available commands:
  - Type any coding request (e.g., "Add email validation to UserService")
  - /init     - Initialize the agent for current project
  - /config   - Configure project settings
  - /status   - Show current status
  - /compile  - Check TypeScript compilation
  - /help     - Show detailed help
  - /exit     - Exit the agent

📦 Detected project: my-awesome-app
📁 Project root: /path/to/your/project
✅ TypeScript configuration found
💡 Run /init to initialize the agent for this project

Ready! What would you like me to help you with?
🤖 AI Agent > 
```

## 🎯 Basic Workflow

1. **Initialize the Agent**
   ```
   🤖 AI Agent > /init
   ```
   
2. **Make Coding Requests**
   ```
   🤖 AI Agent > Add email validation to the UserService class
   🤖 AI Agent > Create a new component for user profile editing
   🤖 AI Agent > Fix TypeScript errors in auth.service.ts
   ```

3. **Check Status and Compilation**
   ```
   🤖 AI Agent > /status
   🤖 AI Agent > /compile
   ```

## 📝 Example Requests

The agent understands natural language requests like:

### Adding Features
- "Add email validation to UserService"
- "Create a new component for user profile editing"
- "Add error handling to the API endpoints"
- "Implement authentication middleware"

### Fixing Issues
- "Fix TypeScript errors in auth.service.ts"
- "Fix the circular dependency between UserService and AuthService"
- "Update imports to use the new module structure"

### Refactoring
- "Refactor the user repository to use async/await"
- "Convert this class to use dependency injection"
- "Split the large UserController into smaller controllers"

### Code Improvements
- "Add proper TypeScript types to user.service.ts"
- "Add unit tests for the UserService"
- "Optimize the database queries in UserRepository"

## 🎛️ Available Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/init` | Initialize agent for current project | `/init` |
| `/config` | Show current configuration | `/config` |
| `/status` | Show agent and project status | `/status` |
| `/compile` | Check TypeScript compilation | `/compile` |
| `/debug` | Toggle debug mode | `/debug` |
| `/root <path>` | Change project root directory | `/root ./my-project` |
| `/help` | Show detailed help | `/help` |
| `/exit` | Exit the agent | `/exit` |

## 🔧 Configuration

### Project Root
By default, the agent uses the current directory as the project root. Change it with:
```
🤖 AI Agent > /root /path/to/your/project
```

### Debug Mode
Enable detailed logging:
```
🤖 AI Agent > /debug
```

## 📊 Status Information

Use `/status` to see:
- Agent initialization status
- Project information
- TypeScript compilation status
- Current configuration

Example output:
```
📊 Agent Status:
================
🤖 Agent: Ready
📁 Project: Loaded
✅ TypeScript: No errors
📁 Working Directory: /path/to/project
🔧 Debug Mode: OFF
```

## 🛠️ How It Works

1. **Project Analysis**: The agent scans your project structure and builds a dependency tree
2. **Context Building**: It understands your codebase by analyzing imports, exports, and relationships
3. **Request Processing**: Natural language requests are converted into specific file modifications
4. **Smart Editing**: Changes are applied with precise line tracking to avoid conflicts
5. **Validation**: TypeScript compilation is checked after changes

## 💡 Tips for Best Results

### Be Specific
```
❌ "Fix the user stuff"
✅ "Add email validation to the UserService.validateUser method"
```

### Mention File Names
```
❌ "Add authentication"
✅ "Add JWT authentication to auth.service.ts"
```

### Describe the Context
```
❌ "This is broken"
✅ "The TypeScript error in user.controller.ts line 15 about missing return type"
```

### Use Progressive Requests
```
1. "Add a User interface to types/user.ts"
2. "Update UserService to use the new User interface"
3. "Add validation for the User properties"
```

## 🔍 Debugging

If something isn't working:

1. **Enable Debug Mode**
   ```
   🤖 AI Agent > /debug
   ```

2. **Check Project Structure**
   ```
   🤖 AI Agent > /config
   🤖 AI Agent > /status
   ```

3. **Verify TypeScript Setup**
   ```
   🤖 AI Agent > /compile
   ```

4. **Re-initialize if Needed**
   ```
   🤖 AI Agent > /init
   ```

## 🚧 Current Limitations

- **AI Integration**: Currently simulates AI responses (you'll need to integrate with your preferred AI service)
- **File Types**: Optimized for TypeScript/JavaScript projects
- **Complex Refactoring**: Large-scale refactoring may require multiple steps

## 🛣️ Roadmap

- [ ] Integration with OpenAI/Claude APIs
- [ ] Support for more file types (Python, Java, etc.)
- [ ] Visual diff preview before applying changes
- [ ] Undo/redo functionality
- [ ] Project templates and scaffolding
- [ ] Integration with version control

## 🤝 Contributing

This is the first step toward a fully autonomous coding agent. Future enhancements will include:

- Real AI integration for intelligent code generation
- Advanced code understanding and refactoring capabilities
- Multi-language support
- Integration with popular editors and IDEs

---

**Happy Coding! 🚀**