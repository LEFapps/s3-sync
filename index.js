'use strict'

var { syncCleanInvalidate } = require('../lib/')
const debug = require('debug')

/**
 *
 **/
class S3SyncPlugin {
  constructor (serverless, options) {
    this.serverless = serverless
    this.options = options

    this.commands = {
      sync: {
        usage: 'Synchronizes a local directory with an S3 bucket',
        lifecycleEvents: ['sync']
      }
    }
    this.hooks = {
      'after:deploy:deploy': () => sync.bind(null, serverless, options),
      's3sync:sync': () => sync.bind(null, serverless, options)
    }

    const sync = async (serverless, options) => {
      const s3Sync = this.serverless.service.custom.s3Sync
      const cli = this.serverless.cli
      debug.log = cli.bind(this.serverless) // we bind the debug output to the cli
      if (s3Sync && Array.isArray(s3Sync)) {
        const promises = s3Sync.map((config) => {
          const { bucketName, localDir, ...options } = s3Sync
          if (typeof bucketName !== 'string' || typeof localDir !== 'string') {
            throw new Error(`s3-sync: bucketName and localDir are required`)
          }
          return syncCleanInvalidate(localDir, bucketName, options)
        })
        return Promise.all(promises).then(() => {
          cli.printDot()
          cli.consoleLog(`Synchronized buckets`)
        })
      }
    }
  }
}

module.exports = S3SyncPlugin
