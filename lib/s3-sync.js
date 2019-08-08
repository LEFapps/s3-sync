const fs = require('fs')
const path = require('path')
const promisify = require('util').promisify
const AWS = require('aws-sdk')
const md5 = require('md5-file/promise')
const mime = require('mime-types')

const readFile = promisify(fs.readFile)
/*
 * Copy from the source folder to th S3 bucket.
 */
function s3Sync (source, bucket, options, callback) {
  var cback = callback
  if (options.aws) {
    AWS.config.update(options.aws)
  }
  var s3 = new AWS.S3()
  const headObject = promisify(s3.headObject.bind(s3))
  const putObject = promisify(s3.putObject.bind(s3))

  const log = options.quiet ? function () {} : console.log

  if (!callback) {
    cback = options
    options = {}
  }

  var basePath = process.cwd()

  var currentPath = path.resolve(basePath, source)

  var filter = options.filter

  var dereference = options.dereference

  var errs = null

  var started = 0

  var finished = 0

  var running = 0

  // which paths (files) were uploaded to S3?
  var changedPaths = []

  var limit = options.limit || s3Sync.limit || 16

  limit = (limit < 1) ? 1 : (limit > 512) ? 512 : limit

  startCopy(currentPath)

  function startCopy (source) {
    started++
    if (filter) {
      if (filter instanceof RegExp) {
        if (!filter.test(source)) {
          return tally(true)
        }
      } else if (typeof filter === 'function') {
        if (!filter(source)) {
          return tally(true)
        }
      }
    }
    return getStats(source)
  }

  function getStats (source) {
    var stat = dereference ? fs.stat : fs.lstat
    if (running >= limit) {
      return setImmediate(function () {
        getStats(source)
      })
    }
    running++
    stat(source, function (err, stats) {
      var item = {}
      if (err) {
        return onError(err)
      }

      // We need to get the mode from the stats object and preserve it.
      item.name = source
      item.mode = stats.mode
      item.mtime = stats.mtime // modified time
      item.atime = stats.atime // access time

      if (stats.isDirectory()) {
        return onDir(item)
      } else if (stats.isFile()) {
        return onFile(item)
      } else if (stats.isSymbolicLink()) {
        // Symlinks don't really need to know about the mode.
        // return onLink(source);
        // Not supported for now.
        log(`Link not supported: ${item.name}`)
        return tally()
      }
    })
  }

  async function onFile (file) {
    const key = file.name.substring(currentPath.length + 1)
    log('analysing: ' + key + ' from ' + basePath)
    try {
      const md5Hash = await md5(file.name)
      const s3Object = {
        Bucket: bucket,
        Key: key
      }
      let header
      try {
        header = await headObject(s3Object)
      } catch (e) {
        if (e.code === 'NotFound') {
          log(`File doesn't exist yet`, key)
        } else {
          throw e
        }
      }
      // note that for some reason AWS includes quote marks inside the ETag
      if (header && header.ETag.replace(/"/g, '') === md5Hash) {
        log('Skipping identical file', file.name)
        return tally()
      }
      s3Object.Body = await readFile(file.name)
      s3Object.ContentType = mime.contentType(path.extname(file.name))
      if (options.publicRead) {
        s3Object.ACL = 'public-read'
      }
      if (options.cache) {
        s3Object.CacheControl = 'max-age=3153600'
      }
      const res = await putObject(s3Object)
      log('Finished upload', res)
      changedPaths.push(key)
      return tally()
    } catch (err) {
      onError(err)
      return tally()
    }
  }

  function onDir (dir) {
    copyDir(dir.name)
  }

  function copyDir (dir) {
    fs.readdir(dir, function (err, items) {
      if (err) {
        return onError(err)
      }
      items.forEach(function (item) {
        startCopy(path.join(dir, item))
      })
      return tally()
    })
  }

  function onError (err) {
    if (options.stopOnError) {
      return cback(err)
    } else if (!errs && options.errs) {
      errs = fs.createWriteStream(options.errs)
    } else if (!errs) {
      errs = []
    }
    if (typeof errs.write === 'undefined') {
      errs.push(err)
    } else {
      errs.write(err.stack + '\n\n')
    }
    return tally()
  }

  function tally (skipped) {
    if (!skipped) running--
    finished++
    if ((started === finished) && (running === 0)) {
      if (cback !== undefined) {
        return errs ? cback(errs, changedPaths) : cback(null, changedPaths)
      }
    }
  }
}

// export default s3Sync;
module.exports = s3Sync
