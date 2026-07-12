# Novel AI Assistant - Development Documentation

## Overview

This document describes the technical implementation of the Novel AI Assistant feature within the Toast Blog project.

## File Structure

- `novel-ai.html` - Main UI structure
- `novel-ai.css` - Styling and theme variables
- `novel-ai.js` - Core application logic

## Key Components

### UI Layout
- Sidebar: Project info, chapter list, metrics
- Main workspace: Top bar with actions, editor area
- Panels: Knowledge base, publish plan, history, audit
- Hero cards: Writing goals, AI status, publish queue

### Data Flow
1. User interacts with UI (buttons, inputs)
2. Actions trigger JavaScript functions in novel-ai.js
3. State managed via localStorage or in-memory objects
4. Persistence: Project data, chapter drafts, AI history stored locally
5. AI simulation: Mock responses for demonstration

## Styling Approach
- CSS variables for theming (light/dark)
- BEM-like naming conventions
- Responsive design for sidebar collapse
- Skeleton loading states

## Dependencies
- Vanilla JavaScript (ES2020)
- No external libraries (core functionality)
- Uses browser APIs: localStorage, fetch (for mock AI)

## Build Process
- Part of main Vite build via `npm run build`
- Files copied to dist/ via postbuild script
- Service worker caching for PWA support

## Extension Points
- Add new actions via `data-action` attributes
- Extend sidebar panels with new sections
- Enhance AI mock responses in novel-ai.js
- Add real AI backend integration hooks

## Testing
- Manual verification via browser
- Screenshot regression testing (see testing documentation)
- LocalStorage isolation per environment (dev/test/prod)

