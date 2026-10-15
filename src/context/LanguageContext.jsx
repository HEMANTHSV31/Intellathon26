import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { translations, translateText } from '../utils/translations'

const LanguageContext = createContext()

// Map of original English text for DOM nodes to restore cleanly on language switch
const originalTextMap = new WeakMap()
const originalPlaceholderMap = new WeakMap()

// Pre-sorted entries by length descending so longer sentences match before individual words
const sortedEntries = Object.entries(translations).sort((a, b) => b[0].length - a[0].length)

function translateDom(targetLang) {
  if (typeof document === 'undefined') return

  // 1. Translate Placeholders
  const inputs = document.querySelectorAll('input[placeholder], textarea[placeholder]')
  inputs.forEach((el) => {
    if (targetLang === 'ta') {
      if (!originalPlaceholderMap.has(el)) {
        originalPlaceholderMap.set(el, el.getAttribute('placeholder'))
      }
      const orig = originalPlaceholderMap.get(el)
      if (orig) {
        let translated = orig
        for (const [en, ta] of sortedEntries) {
          if (translated.includes(en)) {
            translated = translated.replaceAll(en, ta)
          }
        }
        el.setAttribute('placeholder', translated)
      }
    } else {
      if (originalPlaceholderMap.has(el)) {
        el.setAttribute('placeholder', originalPlaceholderMap.get(el))
      }
    }
  })

  // 2. Translate Text Nodes
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node || !node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
        const parent = node.parentElement
        if (!parent) return NodeFilter.FILTER_REJECT
        const tag = parent.tagName.toLowerCase()
        if (tag === 'script' || tag === 'style' || tag === 'canvas' || tag === 'code' || tag === 'pre') {
          return NodeFilter.FILTER_REJECT
        }
        if (parent.closest('.notranslate')) {
          return NodeFilter.FILTER_REJECT
        }
        return NodeFilter.FILTER_ACCEPT
      }
    }
  )

  let node
  while ((node = walker.nextNode())) {
    if (targetLang === 'ta') {
      const currentVal = node.nodeValue
      if (!originalTextMap.has(node)) {
        originalTextMap.set(node, currentVal)
      }
      const baseVal = originalTextMap.get(node)
      let translatedVal = baseVal

      // Direct exact match
      const trimmed = baseVal.trim()
      if (translations[trimmed]) {
        translatedVal = baseVal.replace(trimmed, translations[trimmed])
      } else {
        // Multi-phrase substring match
        for (const [en, ta] of sortedEntries) {
          if (translatedVal.includes(en)) {
            translatedVal = translatedVal.replaceAll(en, ta)
          }
        }
      }

      if (translatedVal !== currentVal) {
        node.nodeValue = translatedVal
      }
    } else {
      // Revert to English
      if (originalTextMap.has(node)) {
        const orig = originalTextMap.get(node)
        if (node.nodeValue !== orig) {
          node.nodeValue = orig
        }
      }
    }
  }
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      return localStorage.getItem('preferred_language') || 'en'
    } catch {
      return 'en'
    }
  })

  const location = useLocation()
  const isTranslatingRef = useRef(false)

  const setLanguage = (lang) => {
    setLanguageState(lang)
    try {
      localStorage.setItem('preferred_language', lang)
    } catch (e) {
      console.warn('Failed to save language preference:', e)
    }
  }

  const t = (key) => translateText(key, language)

  // Run DOM translation whenever language changes OR user navigates between routes
  useEffect(() => {
    const run = () => {
      if (isTranslatingRef.current) return
      isTranslatingRef.current = true
      translateDom(language)
      isTranslatingRef.current = false
    }

    // Run immediately and after a short paint cycle
    run()
    const timer = setTimeout(run, 60)
    const secondTimer = setTimeout(run, 250)

    // Mutation observer for dynamic content (modal popups, screening results, etc.)
    let observer
    if (language === 'ta') {
      let timeoutId
      observer = new MutationObserver(() => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(run, 40)
      })

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: false
      })
    }

    return () => {
      clearTimeout(timer)
      clearTimeout(secondTimer)
      if (observer) observer.disconnect()
    }
  }, [language, location.pathname, location.search])

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
