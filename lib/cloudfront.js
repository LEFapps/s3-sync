const AWS = require('aws-sdk')
const { promisify } = require('util')

/*
 * Invalidates these specified paths on this CloudFrontId.
 * Note that it may take 10-15 minutes to see the effects.
 */

const invalidateCloudFront = async (ID, paths, options) => {
  // CloudFront doesn't like paths that don't start with '/'
  paths = paths.map((p) => p.startsWith('/') ? p : '/' + p)
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
  const createInvalidation = promisify(cloudfront.createInvalidation.bind(cloudfront))
  const getDistribution = promisify(cloudfront.getDistribution.bind(cloudfront))
  await createInvalidation(params)
  const distribution = await getDistribution({ Id: ID })
  return `http://${distribution.DomainName}`
}

module.exports = { invalidateCloudFront }
