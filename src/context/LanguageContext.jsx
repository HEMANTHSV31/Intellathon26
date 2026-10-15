import React, { createContext, useContext, useState, useEffect } from 'react'
import { translations, translateText } from '../utils/translations'

const LanguageContext = createContext()

// Map of original English text for DOM nodes to restore on language switch
const originalTextMap = new WeakMap()

function translateDom(targetLang) {
  if (typeof document === 'undefined') return

  // Collect text entries sorted by length descending so longer phrases match first
  const entries = Object.entries(translations).sort((a, b) => b[0].length - a[0].length)

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node || !node.nodeValue) return NodeFilter.FILTER_REJECT
        const parent = node.parentElement
        if (!parent) return NodeFilter.FILTER_REJECT
        const tag = parent.tagName.toLowerCase()
        if (tag === 'script' || tag === 'style' || tag === 'canvas' || tag === 'code') {
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
      let currentVal = node.nodeValue
      if (!originalTextMap.has(node)) {
        originalTextMap.set(node, currentVal)
      }
      let baseVal = originalTextMap.get(node)
      let translatedVal = baseVal

      for (const [en, ta] of entries) {
        if (translatedVal.includes(en)) {
          translatedVal = translatedVal.replaceAll(en, ta)
        }
      }
      if (translatedVal !== currentVal) {
        node.nodeValue = translatedVal
      }
    } else {
      // Restore English
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

  const setLanguage = (lang) => {
    setLanguageState(lang)
    try {
      localStorage.setItem('preferred_language', lang)
    } catch (e) {
      console.warn('Failed to save language preference:', e)
    }
  }

  const t = (key) => translateText(key, language)

  // Run DOM translation whenever language or route changes
  useEffect(() => {
    translateDom(language)

    if (language === 'ta') {
      // Observe DOM mutations to translate dynamically rendered elements
      const observer = new MutationObserver(() => {
        translateDom('ta')
      })
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: false
      })
      return () => observer.disconnect()
    }
  }, [language])

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
