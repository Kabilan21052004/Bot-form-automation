const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'form_cache.json');

class CacheService {
    constructor() {
        this.cache = {};
        this.loadCache();
    }

    /**
     * Load the cache from form_cache.json if it exists.
     * Uses console.error for all logging to avoid breaking MCP stdio protocol.
     */
    loadCache() {
        try {
            if (fs.existsSync(CACHE_FILE)) {
                const data = fs.readFileSync(CACHE_FILE, 'utf8');
                this.cache = JSON.parse(data);
                console.error(`[CacheService] Loaded ${Object.keys(this.cache).length} cached forms.`);
            } else {
                this.cache = {};
                this.saveCache();
            }
        } catch (error) {
            console.error('[CacheService] Error loading cache:', error.message);
            this.cache = {};
        }
    }

    /**
     * Save the current cache to form_cache.json.
     */
    saveCache() {
        try {
            fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2), 'utf8');
        } catch (error) {
            console.error('[CacheService] Error saving cache:', error.message);
        }
    }

    /**
     * Normalize URLs by removing query parameters
     */
    normalizeUrl(url) {
        try {
            const u = new URL(url);
            return u.origin + u.pathname;
        } catch (e) {
            return url;
        }
    }

    /**
     * Retrieve cached fields for a URL.
     */
    getFields(url) {
        const key = this.normalizeUrl(url);
        return this.cache[key] || null;
    }

    /**
     * Save fields for a URL to the cache.
     */
    saveFields(url, fields) {
        const key = this.normalizeUrl(url);
        this.cache[key] = fields;
        this.saveCache();
    }
}

module.exports = new CacheService();
