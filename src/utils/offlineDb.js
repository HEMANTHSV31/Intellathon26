/**
 * IndexedDB Offline & Request Response Cache Engine
 * Enables fully offline client-side clinical screening in rural & remote clinics.
 * 
 * Features:
 * - Caches API request/response pairs (auth, lookups, patient queries)
 * - Offline session persistence (allows healthcare workers to stay logged in with no internet)
 * - Offline patient screening storage (saves complete DR analysis records locally)
 * - TensorFlow.js IndexedDB model persistence coordination
 * - Offline/Online network event dispatching
 */

const DB_NAME = 'dr_rural_offline_db'
const DB_VERSION = 1

const STORES = {
  REQUESTS: 'requests_cache',
  AUTH: 'auth_cache',
  SCREENINGS: 'screenings_cache',
  APP_META: 'app_meta'
}

let dbPromise = null

/**
 * Open or initialize IndexedDB instance
 */
export function getDb() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'))
  }

  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result

      // Store 1: General Request/Response Cache
      if (!db.objectStoreNames.contains(STORES.REQUESTS)) {
        const reqStore = db.createObjectStore(STORES.REQUESTS, { keyPath: 'key' })
        reqStore.createIndex('url', 'url', { unique: false })
        reqStore.createIndex('timestamp', 'timestamp', { unique: false })
      }

      // Store 2: Offline Authentication Session
      if (!db.objectStoreNames.contains(STORES.AUTH)) {
        db.createObjectStore(STORES.AUTH, { keyPath: 'id' })
      }

      // Store 3: Local Patient Screening Records
      if (!db.objectStoreNames.contains(STORES.SCREENINGS)) {
        const scStore = db.createObjectStore(STORES.SCREENINGS, { keyPath: 'id' })
        scStore.createIndex('timestamp', 'timestamp', { unique: false })
        scStore.createIndex('verdict', 'verdict', { unique: false })
      }

      // Store 4: App & Model Metadata
      if (!db.objectStoreNames.contains(STORES.APP_META)) {
        db.createObjectStore(STORES.APP_META, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error)
      dbPromise = null
      reject(request.error)
    }
  })

  return dbPromise
}

/**
 * Generate a deterministic cache key for a request
 */
function createRequestKey(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  let bodyStr = ''
  if (options.body) {
    bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
  }
  return `${method}:::${url}:::${bodyStr}`
}

/**
 * Cache an API response in IndexedDB
 * @param {string} url 
 * @param {object} options 
 * @param {any} data 
 * @param {number} ttlMs Default 7 days
 */
export async function cacheApiResponse(url, options = {}, data, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  try {
    const db = await getDb()
    const key = createRequestKey(url, options)
    const entry = {
      key,
      url,
      method: (options.method || 'GET').toUpperCase(),
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttlMs
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.REQUESTS, 'readwrite')
      const store = tx.objectStore(STORES.REQUESTS)
      const req = store.put(entry)
      req.onsuccess = () => resolve(entry)
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('IndexedDB cacheApiResponse error:', err)
    return null
  }
}

/**
 * Retrieve a cached response from IndexedDB
 */
export async function getCachedApiResponse(url, options = {}, ignoreExpiry = false) {
  try {
    const db = await getDb()
    const key = createRequestKey(url, options)

    return new Promise((resolve) => {
      const tx = db.transaction(STORES.REQUESTS, 'readonly')
      const store = tx.objectStore(STORES.REQUESTS)
      const req = store.get(key)
      req.onsuccess = () => {
        const item = req.result
        if (!item) return resolve(null)
        if (!ignoreExpiry && item.expiresAt && Date.now() > item.expiresAt) {
          return resolve(null)
        }
        resolve(item.data)
      }
      req.onerror = () => resolve(null)
    })
  } catch (err) {
    console.warn('IndexedDB getCachedApiResponse error:', err)
    return null
  }
}

/**
 * Drop-in wrapper around fetch with transparent IndexedDB caching.
 * Tries network first; if offline or network fails, serves cached response.
 */
export async function cachedFetch(url, options = {}, config = {}) {
  const { ttlMs = 7 * 24 * 60 * 60 * 1000, fallbackData = null } = config
  const isGetOrPost = !options.method || ['GET', 'POST'].includes(options.method.toUpperCase())

  // If strictly offline, immediately check IndexedDB
  if (typeof navigator !== 'undefined' && !navigator.onLine && isGetOrPost) {
    const cached = await getCachedApiResponse(url, options, true)
    if (cached !== null) {
      console.log(`[Rural Offline DB] Served from IndexedDB (Offline): ${url}`)
      return {
        ok: true,
        status: 200,
        statusText: 'OK (IndexedDB Cache)',
        isCached: true,
        json: async () => cached,
        text: async () => (typeof cached === 'string' ? cached : JSON.stringify(cached))
      }
    }
  }

  // Attempt network request
  try {
    const response = await fetch(url, options)
    if (response.ok && isGetOrPost) {
      // Clone response to read JSON and store in IndexedDB
      try {
        const clone = response.clone()
        const data = await clone.json()
        await cacheApiResponse(url, options, data, ttlMs)
      } catch {
        // Not JSON or streaming; ignore caching
      }
    }
    return response
  } catch (netErr) {
    console.warn(`[Rural Offline DB] Network failed for ${url}, checking IndexedDB...`, netErr)
    if (isGetOrPost) {
      const cached = await getCachedApiResponse(url, options, true)
      if (cached !== null) {
        console.log(`[Rural Offline DB] Served from IndexedDB (Fallback): ${url}`)
        return {
          ok: true,
          status: 200,
          statusText: 'OK (IndexedDB Offline Fallback)',
          isCached: true,
          json: async () => cached,
          text: async () => (typeof cached === 'string' ? cached : JSON.stringify(cached))
        }
      }
    }

    if (fallbackData !== null) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK (Default Offline Fallback)',
        isCached: true,
        json: async () => fallbackData,
        text: async () => (typeof fallbackData === 'string' ? fallbackData : JSON.stringify(fallbackData))
      }
    }

    throw netErr
  }
}

/**
 * Save user session in IndexedDB for offline authentication
 */
export async function saveOfflineAuthSession(user, token) {
  try {
    const db = await getDb()
    const entry = {
      id: 'active_session',
      user,
      token,
      updatedAt: Date.now()
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.AUTH, 'readwrite')
      const store = tx.objectStore(STORES.AUTH)
      const req = store.put(entry)
      req.onsuccess = () => resolve(entry)
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('saveOfflineAuthSession error:', err)
  }
}

/**
 * Retrieve cached user session from IndexedDB
 */
export async function getOfflineAuthSession() {
  try {
    const db = await getDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.AUTH, 'readonly')
      const store = tx.objectStore(STORES.AUTH)
      const req = store.get('active_session')
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

/**
 * Clear cached user session
 */
export async function clearOfflineAuthSession() {
  try {
    const db = await getDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.AUTH, 'readwrite')
      const store = tx.objectStore(STORES.AUTH)
      const req = store.delete('active_session')
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

/**
 * Save patient screening result locally in IndexedDB
 */
export async function saveOfflineScreening(record) {
  try {
    const db = await getDb()
    const entry = {
      id: record.id || `screening_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: record.timestamp || Date.now(),
      formattedDate: new Date(record.timestamp || Date.now()).toLocaleString(),
      fileName: record.fileName || 'Fundus Image',
      qualityVerdict: record.qualityVerdict || 'usable',
      qualityReason: record.qualityReason || '',
      drPrediction: record.drPrediction || 'Unknown',
      drConfidence: record.drConfidence || 0,
      drScore: record.drScore || 0,
      referable: !!record.referable,
      icdrGrade: record.icdrGrade || 'Not graded',
      recommendations: record.recommendations || [],
      lesionCounts: record.lesionCounts || {},
      synced: false
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SCREENINGS, 'readwrite')
      const store = tx.objectStore(STORES.SCREENINGS)
      const req = store.put(entry)
      req.onsuccess = () => {
        // Dispatch event for UI reactivity
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('dr-screening-saved', { detail: entry }))
        }
        resolve(entry)
      }
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('saveOfflineScreening error:', err)
    return null
  }
}

/**
 * Retrieve all offline screenings
 */
export async function getOfflineScreenings(limit = 50) {
  try {
    const db = await getDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.SCREENINGS, 'readonly')
      const store = tx.objectStore(STORES.SCREENINGS)
      const req = store.getAll()
      req.onsuccess = () => {
        const results = (req.result || []).sort((a, b) => b.timestamp - a.timestamp)
        resolve(results.slice(0, limit))
      }
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

/**
 * Delete a screening record by ID
 */
export async function deleteOfflineScreening(id) {
  try {
    const db = await getDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.SCREENINGS, 'readwrite')
      const store = tx.objectStore(STORES.SCREENINGS)
      const req = store.delete(id)
      req.onsuccess = () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('dr-screening-deleted', { detail: { id } }))
        }
        resolve(true)
      }
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

/**
 * Check if the TensorFlow.js model is cached in IndexedDB
 */
export async function isTfModelCached() {
  if (typeof window === 'undefined' || !window.tf || !window.tf.io) return false
  try {
    const models = await window.tf.io.listModels()
    return !!models['indexeddb://dr-classifier-model']
  } catch {
    return false
  }
}

/**
 * Summary stats for rural offline status badge/modal
 */
export async function getRuralCacheStats() {
  try {
    const db = await getDb()
    const countRequests = await new Promise((resolve) => {
      const tx = db.transaction(STORES.REQUESTS, 'readonly')
      const req = tx.objectStore(STORES.REQUESTS).count()
      req.onsuccess = () => resolve(req.result || 0)
      req.onerror = () => resolve(0)
    })

    const countScreenings = await new Promise((resolve) => {
      const tx = db.transaction(STORES.SCREENINGS, 'readonly')
      const req = tx.objectStore(STORES.SCREENINGS).count()
      req.onsuccess = () => resolve(req.result || 0)
      req.onerror = () => resolve(0)
    })

    const modelCached = await isTfModelCached()

    return {
      cachedRequests: countRequests,
      storedScreenings: countScreenings,
      isModelCached: modelCached,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true
    }
  } catch {
    return {
      cachedRequests: 0,
      storedScreenings: 0,
      isModelCached: false,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true
    }
  }
}
