import { describe, it, expect } from 'vitest'
import { getSystemPrompt } from '../../src/constants/prompts.js'
import { getAllBaseTools } from '../../src/tools.js'

const MODEL = 'claude-sonnet-4-6'

describe('getSystemPrompt()', () => {
  it('returns an array', async () => {
    const tools = getAllBaseTools()
    const prompt = await getSystemPrompt(tools, MODEL)
    expect(Array.isArray(prompt)).toBe(true)
  })

  it('returns a non-empty array', async () => {
    const tools = getAllBaseTools()
    const prompt = await getSystemPrompt(tools, MODEL)
    expect(prompt.length).toBeGreaterThan(0)
  })

  it('every element is a non-empty string', async () => {
    const tools = getAllBaseTools()
    const prompt = await getSystemPrompt(tools, MODEL)
    for (const part of prompt) {
      expect(typeof part).toBe('string')
      expect(part.length).toBeGreaterThan(0)
    }
  })

  it('prompt text does not contain unresolved "undefined" MACRO references', async () => {
    const tools = getAllBaseTools()
    const prompt = await getSystemPrompt(tools, MODEL)
    const combined = prompt.join('\n')
    // MACRO.VERSION and similar should be resolved — "undefined" would indicate a missing global
    expect(combined).not.toMatch(/\bundefined\b.*version/i)
    expect(combined).not.toMatch(/version.*\bundefined\b/i)
  })

  it('prompt mentions Claude Code', async () => {
    const tools = getAllBaseTools()
    const prompt = await getSystemPrompt(tools, MODEL)
    const combined = prompt.join('\n')
    expect(combined.toLowerCase()).toContain('claude')
  })
})
