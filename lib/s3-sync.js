const fs = require('fs');
const path = require('path');
const promisify = require('util').promisify;
const AWS = require('aws-sdk');
const md5_file = require('md5-file/promise');

const readFile = promisify(fs.readFile);
/*
 * Copy from th source folder to th S3 buckte.
 */
function s3_sync (source, bucket, options, callback) {
  var cback = callback;
  if (options.aws) {
    AWS.config.update(options.aws);
  }
  var s3 = new AWS.S3();
  const headObject = promisify(s3.headObject.bind(s3));
  const putObject = promisify(s3.putObject.bind(s3));

  const log = options.quiet ? function(){} : console.log; 

  if (!callback) {
    cback = options;
    options = {};
  }

  var basePath = process.cwd(),
    currentPath = path.resolve(basePath, source),
    // targetPath = path.resolve(basePath, dest),
    filter = options.filter,
    rename = options.rename,
    transform = options.transform,
    clobber = options.clobber !== false,
    modified = options.modified,
    dereference = options.dereference,
    errs = null,
    started = 0,
    finished = 0,
    running = 0,
    limit = options.limit || s3_sync.limit || 16;

  limit = (limit < 1) ? 1 : (limit > 512) ? 512 : limit;

  startCopy(currentPath);

  function startCopy(source) {
    started++;
    if (filter) {
      if (filter instanceof RegExp) {
	if (!filter.test(source)) {
	  return cb(true);
	}
      }
      else if (typeof filter === 'function') {
	if (!filter(source)) {
	  return cb(true);
	}
      }
    }
    return getStats(source);
  }

  function getStats(source) {
    var stat = dereference ? fs.stat : fs.lstat;
    if (running >= limit) {
      return setImmediate(function () {
	getStats(source);
      });
    }
    running++;
    stat(source, function (err, stats) {
      var item = {};
      if (err) {
	return onError(err);
      }

      // We need to get the mode from the stats object and preserve it.
      item.name = source;
      item.mode = stats.mode;
      item.mtime = stats.mtime; //modified time
      item.atime = stats.atime; //access time

      if (stats.isDirectory()) {
	return onDir(item);
      }
      else if (stats.isFile()) {
	return onFile(item);
      }
      else if (stats.isSymbolicLink()) {
	// Symlinks don't really need to know about the mode.
	// return onLink(source);
        // Not supported for now.
        console.log(`Link not supported: ${item.name}`);
	return cb();
      }
    });
  }

  function checksumFile(algorithm, path) {
    return new Promise((resolve, reject) =>
      fs.createReadStream(path)
	.on('error', reject)
	.pipe(crypto.createHash(algorithm)
	  .setEncoding('hex'))
	.once('finish', function () {
	  resolve(this.read())
	})
    )
  }

  async function onFile(file) {
    const key = file.name.substring(basePath.length+1)
    log('analysing: ' + key + ' from ' + basePath);
    try {
      const md5_hash = await md5_file(file.name);
      const s3_object = {
	  Bucket: bucket,
	  Key: key
      }
      let header = undefined;
      try {
        header = await headObject(s3_object);    
      } catch (e) {
        if (e.code == 'NotFound') {
          log(`File doesn't exist yet`,key);
        } else {
          throw e;
        }
      }
      // note that for some reason AWS includes quote marks inside the ETag
      if (header && header.ETag.replace(/"/g,'') === md5_hash) {
        log("Skipping identical file",file.name);
        return cb();
      }
      s3_object.Body = await readFile(file.name);
      const res = await putObject(s3_object);
      log("Finished upload",res);
      return cb();
    } catch (err) {
      onError(err);
      return cb();
    }
  }

  function copyFile(file, target) {
    var readStream = fs.createReadStream(file.name),
      writeStream = fs.createWriteStream(target, { mode: file.mode });

    readStream.on('error', onError);
    writeStream.on('error', onError);

    if(transform) {
      transform(readStream, writeStream, file);
    } else {
      writeStream.on('open', function() {
	readStream.pipe(writeStream);
      });
    }
    writeStream.once('finish', function() {
      if (modified) {
	//target file modified date sync.
	fs.utimesSync(target, file.atime, file.mtime);
	cb();
      }
      else cb();
    });
  }

  function rmFile(file, done) {
    fs.unlink(file, function (err) {
      if (err) {
	return onError(err);
      }
      return done();
    });
  }

  function onDir(dir) {
    copyDir(dir.name);
  }

  function mkDir(dir, target) {
    fs.mkdir(target, dir.mode, function (err) {
      if (err) {
	return onError(err);
      }
      copyDir(dir.name);
    });
  }

  function copyDir(dir) {
    fs.readdir(dir, function (err, items) {
      if (err) {
	return onError(err);
      }
      items.forEach(function (item) {
	startCopy(path.join(dir, item));
      });
      return cb();
    });
  }

  function onLink(link) {
    var target = link.replace(currentPath, targetPath);
    fs.readlink(link, function (err, resolvedPath) {
      if (err) {
	return onError(err);
      }
      checkLink(resolvedPath, target);
    });
  }

  function checkLink(resolvedPath, target) {
    if (dereference) {
      resolvedPath = path.resolve(basePath, resolvedPath);
    }
    isWritable(target, function (writable) {
      if (writable) {
	return makeLink(resolvedPath, target);
      }
      fs.readlink(target, function (err, targetDest) {
	if (err) {
	  return onError(err);
	}
	if (dereference) {
	  targetDest = path.resolve(basePath, targetDest);
	}
	if (targetDest === resolvedPath) {
	  return cb();
	}
	return rmFile(target, function () {
	  makeLink(resolvedPath, target);
	});
      });
    });
  }

  function makeLink(linkPath, target) {
    fs.symlink(linkPath, target, function (err) {
      if (err) {
	return onError(err);
      }
      return cb();
    });
  }

  function isWritable(path, done) {
    fs.lstat(path, function (err) {
      if (err) {
	if (err.code === 'ENOENT') return done(true);
	return done(false);
      }
      return done(false);
    });
  }

  function onError(err) {
    if (options.stopOnError) {
      return cback(err);
    }
    else if (!errs && options.errs) {
      errs = fs.createWriteStream(options.errs);
    }
    else if (!errs) {
      errs = [];
    }
    if (typeof errs.write === 'undefined') {
      errs.push(err);
    }
    else { 
      errs.write(err.stack + '\n\n');
    }
    return cb();
  }

  function cb(skipped) {
    if (!skipped) running--;
    finished++;
    if ((started === finished) && (running === 0)) {
      if (cback !== undefined ) {
	return errs ? cback(errs) : cback(null);
      }
    }
  }
}

//export default s3_sync;
module.exports = s3_sync
