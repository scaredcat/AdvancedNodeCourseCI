const mongoose = require('mongoose')
const redis = require('redis')
const util = require('util')
const keys = require('../config/keys')

const client = redis.createClient(keys.redisUrl)
client.hget = util.promisify(client.hget)
const exec = mongoose.Query.prototype.exec

mongoose.Query.prototype.cache = function(options = {}) {
    this.useCache = true
    this.hashKey = JSON.stringify(options.key || '')
    return this
}

mongoose.Query.prototype.exec = async function () {
    if (!this.useCache) { return exec.apply(this, arguments) }
    const key = JSON.stringify({
        ...this.getQuery(),
        collection: this.mongooseCollection.name
    })
    // value for key in redis
    const cacheValue = await client.hget(this.hashKey, key)

    // if we do then return that

    if (cacheValue) {
        const doc = JSON.parse(cacheValue)
        if (Array.isArray(doc)) {
            return doc.map(d => this.model(d))
        }
        return new this.model(doc)
    }

    // otherwise issue the query and store the result in redis
    const result = await exec.apply(this, arguments)
    client.hset(this.hashKey, key, JSON.stringify(result))
    client.expire(this.hashKey, 10)
    return result
}

module.exports = {
    clearHash(hashKey) {
        client.del(JSON.stringify(hashKey))
    }
}