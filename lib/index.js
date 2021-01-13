
const { promisify } = require('util')
const syncS3 = require('./s3-sync.js')
const { cleanupS3 } = require('./cleanupS3.js')
const { invalidateCloudFront } = require('./cloudfront.js')
const info = require('debug')('info:s3-sync')
const error = require('debug')('error:s3-sync')
const trace = require('debug')('trace:s3-sync')

const syncCleanInvalidate = async function (source, bucket, options) {
  trace('Synchronizing with options: ')
  trace(JSON.stringify(options))
  const paths = await promisify(syncS3)(source, bucket, options)
  if (Array.isArray(paths.changed) && paths.changed.length > 0) {
    trace('Files updated on S3:')
    paths.changed.forEach((path) => {
      trace(path)
    })
  }
  let changed = paths.changed
  if (options.cleanup) {
    changed = await cleanupS3(bucket, paths.changed.concat(paths.skipped), options)
    trace('Paths to invalidate on CDN:')
    trace(changed)
  }
  if (options.cloudFrontId) {
    const url = await invalidateCloudFront(options.cloudFrontId, changed, options)
    trace(`Invalidated CloudFront at url: ${url}`)
  }
}

module.exports = { syncS3, invalidateCloudFront, cleanupS3, syncCleanInvalidate }
