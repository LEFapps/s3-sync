const syncS3 = require('./s3-sync.js')
const { cleanupS3 } = require('./cleanupS3.js')

const { invalidateCloudFront } = require('./cloudfront.js')

module.exports = { syncS3, invalidateCloudFront, cleanupS3 }
