'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'

interface ParadigmTrigger {
  position: number
  text: string
  isActive: boolean
  isProcessing?: boolean
}

export default function TextEditor() {
  const [content, setContent] = useState('')
  const [triggers, setTriggers] = useState<ParadigmTrigger[]>([])
  const editorRef = useRef<HTMLDivElement>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Detect @Paradigm triggers in the text
  const detectTriggers = useCallback((text: string): ParadigmTrigger[] => {
    const paradigmRegex = /@paradigm/gi
    const detectedTriggers: ParadigmTrigger[] = []
    let match

    while ((match = paradigmRegex.exec(text)) !== null) {
      detectedTriggers.push({
        position: match.index,
        text: match[0],
        isActive: true,
        isProcessing: false
      })
    }

    return detectedTriggers
  }, [])

  // Simple context extraction - just get surrounding text
  const extractContext = useCallback((text: string, triggerPosition: number): string => {
    // Get about 500 characters before and after the trigger for context
    const start = Math.max(0, triggerPosition - 500)
    const end = Math.min(text.length, triggerPosition + 500)
    return text.slice(start, end)
  }, [])

  // Call AI research API
  const researchContext = useCallback(async (context: string): Promise<string> => {
    const response = await fetch('/api/research', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ context }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Research request failed')
    }

    const data = await response.json()
    return data.result
  }, [])

  // Process @Paradigm trigger with AI (by trigger object directly)
  const processTriggerDirect = useCallback(async (targetTrigger: ParadigmTrigger) => {
    try {
      setIsProcessing(true)
      setError(null)

      // Save current cursor position before processing
      let currentCursorPosition = 0
      if (editorRef.current) {
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          currentCursorPosition = range.startOffset
        }
      }

      // Extract context around the trigger
      const context = extractContext(content, targetTrigger.position)
      
      // Get AI research result
      const result = await researchContext(context)
      
      // Replace @Paradigm with the result
      const beforeTrigger = content.slice(0, targetTrigger.position)
      const afterTrigger = content.slice(targetTrigger.position + targetTrigger.text.length)
      const newContent = beforeTrigger + result + afterTrigger

      setContent(newContent)
      
      // Update editor content and preserve cursor position intelligently
      if (editorRef.current) {
        // Calculate the difference in length due to replacement
        const lengthDifference = result.length - targetTrigger.text.length
        
        // Determine where cursor should be after replacement
        let newCursorPosition
        
        if (currentCursorPosition <= targetTrigger.position) {
          // Cursor was before the trigger - keep it in the same place
          newCursorPosition = currentCursorPosition
        } else if (currentCursorPosition >= targetTrigger.position + targetTrigger.text.length) {
          // Cursor was after the trigger - adjust by the length difference
          newCursorPosition = currentCursorPosition + lengthDifference
        } else {
          // Cursor was within the trigger text - place it after the replacement
          newCursorPosition = targetTrigger.position + result.length
        }
        
        // Update the content
        editorRef.current.textContent = newContent
        
        // Restore cursor position
        const range = document.createRange()
        const selection = window.getSelection()
        
        // Find the correct text node and position
        const textNode = editorRef.current.firstChild
        if (textNode && textNode.textContent) {
          const targetPosition = Math.min(Math.max(0, newCursorPosition), textNode.textContent.length)
          range.setStart(textNode, targetPosition)
          range.setEnd(textNode, targetPosition)
          selection?.removeAllRanges()
          selection?.addRange(range)
        }
      }

    } catch (error) {
      console.error('AI research error:', error)
      setError(error instanceof Error ? error.message : 'Research failed')
    } finally {
      setIsProcessing(false)
    }
  }, [content, extractContext, researchContext])

  // Process @Paradigm trigger with AI
  const processTrigger = useCallback(async (triggerIndex: number) => {
    const trigger = triggers[triggerIndex]
    if (!trigger || trigger.isProcessing) return

    try {
      setIsProcessing(true)
      setError(null)

      // Mark trigger as processing
      setTriggers(prev => prev.map((t, i) => 
        i === triggerIndex ? { ...t, isProcessing: true } : t
      ))

      // Extract context around the trigger
      const context = extractContext(content, trigger.position)
      
      // Get AI research result
      const result = await researchContext(context)
      
      // Replace @Paradigm with the result
      const beforeTrigger = content.slice(0, trigger.position)
      const afterTrigger = content.slice(trigger.position + trigger.text.length)
      const newContent = beforeTrigger + result + afterTrigger

      setContent(newContent)
      
      // Update editor content and cursor position
      if (editorRef.current) {
        // Save cursor position relative to the replacement
        const newCursorPosition = trigger.position + result.length
        
        // Update the content
        editorRef.current.textContent = newContent
        
        // Restore cursor position
        const range = document.createRange()
        const selection = window.getSelection()
        
        // Find the correct text node and position
        const textNode = editorRef.current.firstChild
        if (textNode && textNode.textContent) {
          const targetPosition = Math.min(newCursorPosition, textNode.textContent.length)
          range.setStart(textNode, targetPosition)
          range.setEnd(textNode, targetPosition)
          selection?.removeAllRanges()
          selection?.addRange(range)
        }
      }

    } catch (error) {
      console.error('AI research error:', error)
      setError(error instanceof Error ? error.message : 'Research failed')
      
      // Remove processing state from trigger
      setTriggers(prev => prev.map((t, i) => 
        i === triggerIndex ? { ...t, isProcessing: false } : t
      ))
    } finally {
      setIsProcessing(false)
    }
  }, [content, triggers, extractContext, researchContext])

  // Handle text changes and trigger detection
  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement
    const newContent = target.textContent || ''
    
    setContent(newContent)
    
    // Detect triggers
    const newTriggers = detectTriggers(newContent)
    
    setTriggers(prev => {
      // Check if any trigger became complete (fully matches @paradigm)
      const newCompleteTriggers = newTriggers.filter(trigger => {
        const isComplete = trigger.text.toLowerCase() === '@paradigm'
        const wasNotComplete = !prev.some(prevTrigger => 
          prevTrigger.position === trigger.position && 
          prevTrigger.text.toLowerCase() === '@paradigm'
        )
        return isComplete && wasNotComplete
      })
      
      // Process any newly complete triggers immediately
      if (newCompleteTriggers.length > 0) {
        newCompleteTriggers.forEach(trigger => {
          setTimeout(() => {
            processTriggerDirect(trigger)
          }, 100)
        })
      }
      
      return newTriggers
    })
    
    setIsTyping(true)
    setError(null)
    
    // Set timeout to clear typing state
    setTimeout(() => setIsTyping(false), 1000)
  }, [detectTriggers, processTriggerDirect])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Ctrl+Z for undo (browser default)
    if (e.ctrlKey && e.key === 'z') {
      return
    }
    
    // Ctrl+A for select all
    if (e.ctrlKey && e.key === 'a') {
      e.preventDefault()
      if (editorRef.current) {
        const range = document.createRange()
        range.selectNodeContents(editorRef.current)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    }

    // Manual trigger research with Ctrl+Space
    if (e.ctrlKey && e.key === ' ') {
      e.preventDefault()
      if (triggers.length > 0 && !isProcessing) {
        const unprocessedIndex = triggers.findIndex(t => !t.isProcessing)
        if (unprocessedIndex !== -1) {
          processTrigger(unprocessedIndex)
        }
      }
    }
  }, [triggers, isProcessing, processTrigger])

  // Auto-focus the editor on mount
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.focus()
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Main content area with centered document */}
      <div className="max-w-4xl mx-auto px-6 py-8 relative">
        {/* Document page container */}
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 min-h-[800px] relative overflow-hidden">
          {/* Contenteditable editor */}
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            className="w-full h-full min-h-[800px] p-12 border-0 outline-none text-gray-900 leading-relaxed"
            style={{
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontSize: '16px',
              lineHeight: '1.6',
              caretColor: '#0ea5e9',
            }}
            data-placeholder="Start typing your document... Use @Paradigm to trigger AI research assistance."
            suppressContentEditableWarning={true}
          />
          
          {/* GitHub icon at bottom left */}
          <a 
            href="https://github.com/rkdune/inline-agent" 
            target="_blank" 
            rel="noopener noreferrer"
            className="absolute bottom-4 left-4 text-gray-400 hover:text-gray-600 transition-colors duration-200"
            title="View source on GitHub"
          >
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="currentColor"
              className="opacity-60 hover:opacity-80 transition-opacity duration-200"
            >
              <path d="M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
          
          {/* Figma icon next to GitHub */}
          <a 
            href="YOUR_PNG_URL_HERE" 
            target="_blank" 
            rel="noopener noreferrer"
            className="absolute bottom-4 left-10 text-gray-400 hover:text-gray-600 transition-colors duration-200"
            title="the figma mockup that started this!"
          >
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="currentColor"
              className="opacity-60 hover:opacity-80 transition-opacity duration-200"
            >
              <path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.02s-1.354-3.02-3.019-3.02h-3.117v6.04zm0 1.471H8.148c-2.476 0-4.49-2.015-4.49-4.49S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.02s1.354 3.02 3.019 3.02h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.02s1.354 3.02 3.019 3.02h3.117v-6.04H8.148zM8.172 24c-2.489 0-4.515-2.014-4.515-4.49s2.014-4.49 4.49-4.49h4.588v4.441c0 2.503-2.047 4.539-4.563 4.539zm-.024-7.51a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.365 3.019 3.044 3.019 1.705 0 3.093-1.376 3.093-3.068v-2.97H8.148z"/>
            </svg>
          </a>
        </div>

        {/* Bottom status indicators */}
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 flex flex-col items-center space-y-3">
          {/* Error indicator */}
          {error && (
            <div className="flex items-center space-x-2 bg-red-500/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg animate-fade-in">
              <div className="w-2 h-2 bg-white rounded-full"></div>
              <span className="text-sm text-white">{error}</span>
            </div>
          )}

          {/* Processing indicator - takes highest precedence */}
          {isProcessing ? (
            <div className="flex items-center space-x-2 bg-yellow-500/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg animate-fade-in">
              <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
              <span className="text-sm text-white">Researching...</span>
            </div>
          ) : isTyping ? (
            <div className="flex items-center space-x-2 bg-paradigm-500/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg animate-fade-in">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              <span className="text-sm text-white">Typing...</span>
            </div>
          ) : (
            /* Trigger detection indicator - shows when not typing or processing */
            triggers.length > 0 && (
              <div className="flex items-center space-x-2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-gray-200 animate-fade-in">
                <div className="loading-indicator"></div>
                <span className="text-sm text-gray-600">
                  {triggers.length} trigger{triggers.length !== 1 ? 's' : ''} detected
                </span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
} 