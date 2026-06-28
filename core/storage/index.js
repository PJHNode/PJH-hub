/**
 * Core Storage Module
 * 스토리지 관련 기능
 * @module core/storage
 */

/**
 * 로컬 스토리지 래퍼
 */
export class LocalStorage {
  /**
   * @param {string} prefix - 키 프리픽스
   */
  constructor(prefix = 'pjh-hub') {
    this.prefix = prefix;
  }
  
  /**
   * 키 생성
   * @param {string} key 
   * @returns {string}
   */
  _makeKey(key) {
    return `${this.prefix}:${key}`;
  }
  
  /**
   * 값 저장
   * @param {string} key 
   * @param {any} value 
   */
  set(key, value) {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(this._makeKey(key), serialized);
    } catch (error) {
      console.error('LocalStorage set error:', error);
    }
  }
  
  /**
   * 값 조회
   * @param {string} key 
   * @param {any} defaultValue 
   * @returns {any}
   */
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(this._makeKey(key));
      if (item === null) return defaultValue;
      return JSON.parse(item);
    } catch (error) {
      console.error('LocalStorage get error:', error);
      return defaultValue;
    }
  }
  
  /**
   * 값 삭제
   * @param {string} key 
   */
  remove(key) {
    localStorage.removeItem(this._makeKey(key));
  }
  
  /**
   * 전체 삭제
   */
  clear() {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(this.prefix + ':')) {
        localStorage.removeItem(key);
      }
    });
  }
}

/**
 * 세션 스토리지 래퍼
 */
export class SessionStorage {
  /**
   * @param {string} prefix - 키 프리픽스
   */
  constructor(prefix = 'pjh-hub') {
    this.prefix = prefix;
  }
  
  /**
   * 키 생성
   * @param {string} key 
   * @returns {string}
   */
  _makeKey(key) {
    return `${this.prefix}:${key}`;
  }
  
  /**
   * 값 저장
   * @param {string} key 
   * @param {any} value 
   */
  set(key, value) {
    try {
      const serialized = JSON.stringify(value);
      sessionStorage.setItem(this._makeKey(key), serialized);
    } catch (error) {
      console.error('SessionStorage set error:', error);
    }
  }
  
  /**
   * 값 조회
   * @param {string} key 
   * @param {any} defaultValue 
   * @returns {any}
   */
  get(key, defaultValue = null) {
    try {
      const item = sessionStorage.getItem(this._makeKey(key));
      if (item === null) return defaultValue;
      return JSON.parse(item);
    } catch (error) {
      console.error('SessionStorage get error:', error);
      return defaultValue;
    }
  }
  
  /**
   * 값 삭제
   * @param {string} key 
   */
  remove(key) {
    sessionStorage.removeItem(this._makeKey(key));
  }
  
  /**
   * 전체 삭제
   */
  clear() {
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith(this.prefix + ':')) {
        sessionStorage.removeItem(key);
      }
    });
  }
}

/**
 * IndexedDB 래퍼
 */
export class IndexedDBStorage {
  /**
   * @param {string} dbName 
   * @param {string} storeName 
   */
  constructor(dbName = 'PJH-Hub', storeName = 'storage') {
    this.dbName = dbName;
    this.storeName = storeName;
    this.db = null;
  }
  
  /**
   * DB 초기화
   * @returns {Promise<void>}
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }
  
  /**
   * 값 저장
   * @param {string} key 
   * @param {any} value 
   * @returns {Promise<void>}
   */
  async set(key, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(value, key);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * 값 조회
   * @param {string} key 
   * @param {any} defaultValue 
   * @returns {Promise<any>}
   */
  async get(key, defaultValue = null) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);
      
      request.onsuccess = () => {
        resolve(request.result !== undefined ? request.result : defaultValue);
      };
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * 값 삭제
   * @param {string} key 
   * @returns {Promise<void>}
   */
  async remove(key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(key);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * 전체 삭제
   * @returns {Promise<void>}
   */
  async clear() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * 모든 키 조회
   * @returns {Promise<Array<string>>}
   */
  async getAllKeys() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * Cache API 래퍼
 */
export class CacheStorage {
  /**
   * @param {string} cacheName 
   */
  constructor(cacheName = 'pjh-hub-cache') {
    this.cacheName = cacheName;
    this.cache = null;
  }
  
  /**
   * 캐시 초기화
   * @returns {Promise<void>}
   */
  async init() {
    this.cache = await caches.open(this.cacheName);
  }
  
  /**
   * URL 캐싱
   * @param {RequestInfo} request 
   * @param {Response} response 
   * @returns {Promise<void>}
   */
  async put(request, response) {
    if (!this.cache) await this.init();
    await this.cache.put(request, response);
  }
  
  /**
   * 캐시 조회
   * @param {RequestInfo} request 
   * @returns {Promise<Response|null>}
   */
  async get(request) {
    if (!this.cache) await this.init();
    return await this.cache.match(request);
  }
  
  /**
   * 캐시 삭제
   * @param {RequestInfo} request 
   * @returns {Promise<boolean>}
   */
  async delete(request) {
    if (!this.cache) await this.init();
    return await this.cache.delete(request);
  }
  
  /**
   * 전체 캐시 삭제
   * @returns {Promise<boolean>}
   */
  async clear() {
    if (!this.cache) await this.init();
    const keys = await this.cache.keys();
    for (const request of keys) {
      await this.cache.delete(request);
    }
    return true;
  }
}
