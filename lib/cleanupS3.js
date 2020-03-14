const AWS = require('aws-sdk')
const { promisify } = require('util')
const info = require('debug')('info:s3-sync')
const error = require('debug')('error:s3-sync')
const trace = require('debug')('trace:s3-sync')

/**
 * Cleanup a bucket, removing any keys that were previously synchronized but not present anymore.
 */

/**
 * Parameters: bucket name, all paths that are (still) present in the filesystem and options.
 */
const cleanupS3 = async (bucket, paths, options) => {
  if (options.aws) {
    AWS.config.update(options.aws)
  }
  const s3 = new AWS.S3({ apiVersion: '2006-03-01' })
  const params = {
    Bucket: bucket
  }
  const listObjects = promisify(s3.listObjectsV2.bind(s3))
  const headObject = promisify(s3.headObject.bind(s3))
  const deleteObject = promisify(s3.deleteObject.bind(s3))
  // working with a Set can significantly improve speed
  const existing = new Set(paths)
  const data = await listObjects(params)
  if (data.IsTruncated) {
    throw new Error('Bucket contains more than 1.000 objects, operation currently not supported')
  }
  let removedPaths = await Promise.all(
    data.Contents.map(async (s3Object) => {
      const key = s3Object.Key
      if (existing.has(key)) {
        trace(`File present in both filesystem and S3: ${key}`)
      } else {
      // object exists on S3, but not on the filesystem!
        const fileParams = {
          Bucket: bucket,
          Key: key
        }
        const head = await headObject(fileParams)
        if (!head.Metadata || head.Metadata.origin !== 's3-sync') {
          trace(`Manually uploaded file detected in bucket: ${key}`)
          return undefined
        } else {
          trace(`File marked for deletion: ${key}`)
          await deleteObject(fileParams)
          info(`File deleted: ${key}`)
          return key
        }
      }
    }
    )
  )
  removedPaths = removedPaths.filter(p => typeof p === 'string') // eliminated undefined values
  return removedPaths.join(paths.changed)
}

module.exports = { cleanupS3 }
