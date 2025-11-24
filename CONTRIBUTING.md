# Contributing to ZKONTROL

First off, thank you for considering contributing to ZKONTROL! It's people like you that make ZKONTROL such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our commitment to creating a welcoming and harassment-free environment for everyone.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** to demonstrate the steps
- **Describe the behavior you observed** and what you expected
- **Include screenshots** if relevant
- **Include your environment details** (browser, OS, wallet version)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description** of the suggested enhancement
- **Explain why this enhancement would be useful**
- **List any alternative solutions** you've considered

### Pull Requests

1. **Fork the repo** and create your branch from `main`
2. **Make your changes** following our coding standards
3. **Test your changes** thoroughly
4. **Update documentation** if needed
5. **Commit with clear messages** following our commit guidelines
6. **Open a Pull Request** with a comprehensive description

## Development Setup

1. Clone your fork:
```bash
git clone https://github.com/YOUR-USERNAME/zkontrol-secure-communications.git
cd zkontrol-secure-communications
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your values
```

4. Initialize database:
```bash
npm run db:push
```

5. Start development server:
```bash
npm start
```

## Coding Standards

### JavaScript Style Guide

- Use **ES6+ features** (arrow functions, destructuring, etc.)
- Use **ESM modules** (`import`/`export`)
- Use **const** by default, **let** when reassignment needed
- Use **meaningful variable names**
- Add **comments** for complex logic

### Code Formatting

- **2 spaces** for indentation
- **Single quotes** for strings
- **Semicolons** at end of statements
- **Max line length**: 100 characters

### Example:

```javascript
// Good
const getUserRooms = async (userId) => {
  const rooms = await db.select()
    .from(roomMembers)
    .where(eq(roomMembers.userId, userId));
  return rooms;
};

// Avoid
function getUserRooms(userId){
var rooms=db.select().from(roomMembers).where(eq(roomMembers.userId,userId))
return rooms
}
```

## Commit Message Guidelines

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types:
- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, etc.)
- **refactor**: Code refactoring
- **test**: Adding or updating tests
- **chore**: Maintenance tasks

### Examples:

```
feat(chat): add message reactions feature

- Add reactions table to database
- Implement Socket.io events for reactions
- Add emoji picker UI component

Closes #123
```

```
fix(auth): prevent signature replay attacks

Use unique nonce for each authentication attempt
to prevent replay attacks.

Fixes #456
```

## Testing

Before submitting a PR, ensure:

- [ ] Code runs without errors
- [ ] All existing features still work
- [ ] New features have been tested manually
- [ ] Database migrations work correctly
- [ ] WebSocket connections handle edge cases

## Documentation

- Update `README.md` if you change functionality
- Update `API_DOCS.md` if you modify endpoints
- Update `ARCHITECTURE.md` for architectural changes
- Add inline code comments for complex logic

## Database Changes

When modifying the database schema:

1. Update `shared/schema.js`
2. Run `npm run db:push` to apply changes
3. Test with existing data
4. Document changes in PR description

## Git Workflow

1. **Create a feature branch**:
```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes** and commit:
```bash
git add .
git commit -m "feat(scope): description"
```

3. **Keep your branch updated**:
```bash
git fetch origin
git rebase origin/main
```

4. **Push to your fork**:
```bash
git push origin feature/your-feature-name
```

5. **Open a Pull Request** on GitHub

## Pull Request Process

1. **Title**: Use a clear, descriptive title
2. **Description**: Explain what changes you made and why
3. **Link issues**: Reference related issues (e.g., "Closes #123")
4. **Screenshots**: Add screenshots for UI changes
5. **Testing**: Describe how you tested the changes
6. **Checklist**: Complete the PR checklist template

### PR Review Process

- Maintainers will review your PR
- Address any requested changes
- Once approved, a maintainer will merge your PR
- Your contribution will be credited in the changelog

## Code Review Guidelines

When reviewing code:

- Be respectful and constructive
- Focus on code quality and project standards
- Test the changes locally if possible
- Approve or request changes with clear feedback

## Feature Branches

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates

## Security Vulnerabilities

**DO NOT** create public issues for security vulnerabilities.

Report security issues to: **security@zkontrol.io**

See [SECURITY.md](SECURITY.md) for details.

## Community

- **GitHub Discussions**: Ask questions and share ideas
- **Twitter**: [@zkontrol_io](https://x.com/zkontrol_io?s=21)
- **Discord**: Coming soon

## License

By contributing to ZKONTROL, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be recognized in:
- GitHub contributors list
- Release notes
- Project README (for significant contributions)

## Questions?

Feel free to open a GitHub Discussion or contact us at dev@zkontrol.io

---

Thank you for contributing to ZKONTROL! 🙏
