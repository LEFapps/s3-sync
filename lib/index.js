const syncS3 = require('./s3-sync.js')

const { invalidateCloudFront } = require('./cloudfront.js')

module.exports = { syncS3, invalidateCloudFront }
