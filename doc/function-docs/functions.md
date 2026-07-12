# Novel AI Assistant - Functional Documentation

## Core Functions

### 1. Project Management
- **New Project**: Create new writing project with genre/title
- **Project List**: Switch between existing projects
- **Project Info**: Genre, title, description display

### 2. Chapter Management
- **Chapter List**: View all chapters for current project
- **Save Draft**: Save current chapter to localStorage
- **Chapter Navigation**: Jump between chapters
- **Word Count**: Real-time word count display

### 3. AI Assistance Features
- **Sync AI Assist**: Trigger AI suggestions for current chapter
- **Outline**: Generate chapter outline
- **Polish**: Human-like text polishing
- **Screenplay**: Convert to screenplay format
- **Continue Writing**: Continue from current point
- **Hook Enhancement**: Strengthen plot hooks
- **Foreshadowing**: Manage foreshadowing elements
- **Platform Rewrite**: Adapt for different platforms
- **Title Generator**: Generate chapter titles
- **Synopsis Generator**: Create chapter summaries
- **Tag Generator**: Generate relevant tags
- **Dialogue Check**: Review dialogue quality
- **Annotation Suggestions**: AI annotation ideas
- **Term Extraction**: Extract key terms/entities
- **Sensitive Rewrite**: Handle sensitive content
- **Character Bio**: Generate character profiles
- **Timeline**: Organize story timeline
- **Scene Description**: Enhance scene descriptions
- **World Building**: Expand world-building elements
- **Conflict Check**: Verify plot consistency
- **Copyright Warning**: Flag potential copyright issues

### 4. Knowledge Base
- **Knowledge Graph**: Visual representation of story elements
- **Character Relations**: Map character relationships
- **Plot Threads**: Track multiple plot lines
- **World Elements**: Store setting details
- **Search**: Find specific knowledge items

### 5. Publishing Tools
- **Publish Queue**: Schedule chapter releases
- **Retry Logic**: Auto-retry failed publishes (3 attempts)
- **Platform Integration**: Simulated platform publishing
- **Publish Plan**: View upcoming publish schedule

### 6. History & Audit
- **AI History**: View previous AI interactions
- **Audit Log**: Track changes and actions
- **Version Control**: Compare document versions

### 7. Settings
- **API Configuration**: Set OpenAI-compatible endpoint
- **Theme Toggle**: Light/dark mode switch
- **Export/Import**: Backup/restore project data
- **Reset**: Clear all local data

## User Workflow

1. **Create Project** → Select genre, enter title
2. **Write Chapter** → Use editor, track word count
3. **Get AI Help** → Trigger relevant AI function
4. **Review Output** → Accept/reject AI suggestions
5. **Save Draft** → Persist to localStorage
6. **Publish** → Schedule or immediate publish

## Data Model

### Project
```javascript
{
  id: string,
  title: string,
  genre: string,
  description: string,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Chapter
```javascript
{
  projectId: string,
  number: number,
  title: string,
  content: string,
  wordCount: number,
  aiHistory: array,
  savedAt: timestamp
}
```

### KnowledgeItem
```javascript
{
  type: 'character'|'plot'|'world'|'setting',
  name: string,
  details: object,
  relations: array,
  tags: array
}
```

### PublishTask
```javascript
{
  chapterId: string,
  scheduledAt: timestamp,
  status: 'pending'|'published'|'failed',
  retryCount: number,
  platform: string
}
```

## Error Handling

- LocalStorage quota exceeded: Alert user, suggest cleanup
- AI service unavailable: Show offline mode message
- Invalid input: Validate before processing
- Network errors: Retry logic with exponential backoff

## Performance Considerations

- Lazy load heavy panels (knowledge graph, history)
- Debounce word count updates
- Cache AI responses locally
- Optimize large document rendering

