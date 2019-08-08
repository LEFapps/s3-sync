const AWS = require('aws-sdk')

/*
 * Invalidates these specified paths on this CloudFrontId.
 * Note that it may take 10-15 minutes to see the effects.
 */

const invalidateCloudFront = (ID, paths, options, callback = () => {}) => {
  if (options.aws) {
    AWS.config.update(options.aws)
  }
  const cloudfront = new AWS.CloudFront({ apiVersion: '2019-03-26' })
  /* CloudFront requires a unique (for this distribution) identifier per request
   * to prevent accidentally re-firing it. This is a timestamp rounded to the last 10 seconds,
   * which implies it will not refresh within 10 seconds.
   * */
  const callerReference = new Date(Math.floor(Date.now() / 10000) * 10000).toISOString()
  const params = {
    DistributionId: ID,
    InvalidationBatch: {
      CallerReference: callerReference,
      Paths: {
        Quantity: paths.length,
        Items: paths
      }
    }
  }
  cloudfront.createInvalidation(params, callback)
  console.log('Created distribution invalidation')
}

module.exports = { invalidateCloudFront }
