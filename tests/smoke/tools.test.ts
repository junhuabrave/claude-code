import { describe, it, expect } from 'vitest'
import { getAllBaseTools } from '../../src/tools.js'

describe('getAllBaseTools()', () => {
  it('returns an array', () => {
    const tools = getAllBaseTools()
    expect(Array.isArray(tools)).toBe(true)
  })

  it('returns a non-empty list', () => {
    const tools = getAllBaseTools()
    expect(tools.length).toBeGreaterThan(0)
  })

  it('every tool has a name string', () => {
    for (const tool of getAllBaseTools()) {
      expect(typeof tool.name).toBe('string')
      expect(tool.name.length).toBeGreaterThan(0)
    }
  })

  it('every tool has a description function or string', () => {
    for (const tool of getAllBaseTools()) {
      expect(tool.description).toBeDefined()
    }
  })

  it('every tool has an inputSchema object', () => {
    for (const tool of getAllBaseTools()) {
      expect(tool.inputSchema).toBeDefined()
      expect(typeof tool.inputSchema).toBe('object')
    }
  })

  it('BashTool is present', () => {
    const tools = getAllBaseTools()
    expect(tools.some(t => t.name === 'Bash')).toBe(true)
  })

  it('FileReadTool (Read) is present', () => {
    const tools = getAllBaseTools()
    expect(tools.some(t => t.name === 'Read')).toBe(true)
  })

  it('FileWriteTool (Write) is present', () => {
    const tools = getAllBaseTools()
    expect(tools.some(t => t.name === 'Write')).toBe(true)
  })
})
